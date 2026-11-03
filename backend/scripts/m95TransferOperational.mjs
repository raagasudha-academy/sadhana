#!/usr/bin/env node
/** M9.5 deliberately selective: read existing five tables; write ONLY five M9 tables.
 * Default --dry-run. Explicit --execute and exact acknowledgement needed for writes.
 * Never modifies/deletes legacy records, and never writes audit/student/learning data.
 */
import { writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SOURCE_TABLES } from './m9MigrationPlannerCore.mjs';
import { prepareM95OperationalTransfer, M95_EXPECTED, M95_KEYS, hashRecord } from './m95OperationalTransferCore.mjs';

export function parseArgs(argv){
  let mode=null, report=null, acknowledge=false;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--dry-run'||arg==='--execute'){
      if(mode)throw Error('Choose one mode');mode=arg.slice(2);
    } else if(arg==='--ack-operational-only')acknowledge=true;
    else if(arg==='--report'&&argv[i+1]&&!argv[i+1].startsWith('--')) report=argv[++i];
    else throw Error(`Unexpected argument ${arg}`);
  }
  if(!mode)throw Error('Specify --dry-run or --execute');
  if(mode==='execute'&&!acknowledge)throw Error('Execution requires --ack-operational-only');
  if(mode==='dry-run'&&acknowledge)throw Error('Acknowledgement only applies to --execute');
  return {mode,report};
}

const fail = message => {throw Error(message);};
const pageScan=async(doc,table,limit=20000)=>{
  const items=[];let cursor;
  do{
    const result=await doc.send(new ScanCommand({TableName:table,ConsistentRead:true,Limit:100,ExclusiveStartKey:cursor}));
    items.push(...(result.Items??[]));cursor=result.LastEvaluatedKey;
    if(items.length>limit)fail(`Safety limit exceeded: ${table}`);
  }while(cursor);
  return items;
};

export function sameTransferredRecord(existing,planned){
  if(!existing||typeof existing.m95TransferHash!=='string'||existing.m95TransferHash!==planned.item.m95TransferHash)return false;
  const rest=structuredClone(existing);delete rest.m95TransferHash;
  return hashRecord(rest)===planned.item.m95TransferHash;
}

export async function runTransfer({doc,describe,mode}){
  const tables={};
  for(const [name,table] of Object.entries(SOURCE_TABLES))tables[name]=await pageScan(doc,table);
  const plan=prepareM95OperationalTransfer(tables);
  if(!plan.ready)fail(`Source safety checks failed: ${plan.problems.join(', ')}`);
  const targetRows={};
  for(const table of Object.keys(M95_EXPECTED)){
    const detail=await describe(table);
    if(detail.Table?.TableStatus!=='ACTIVE')fail(`${table} is not ACTIVE`);
    const p=detail.Table?.KeySchema??[];
    if(p.length!==1||p[0].KeyType!=='HASH'||p[0].AttributeName!==M95_KEYS[table])fail(`Unexpected DynamoDB key schema for ${table}`);
    targetRows[table]=await pageScan(doc,table,600);
  }
  const inst=await describe('sadhana-dev-m9-institutions');
  if(inst.Table?.TableStatus!=='ACTIVE')fail('New M9 institutions table not active');
  const institutions=await Promise.all(['raaga','sruti'].map(async institutionId=>{
    const response=await doc.send(new GetCommand({TableName:'sadhana-dev-m9-institutions',Key:{institutionId},ConsistentRead:true}));
    return response.Item;
  }));
  if(institutions.some((item,i)=>!item||item.institutionId!==['raaga','sruti'][i]||item.status!=='active'))fail('Raagasudha/Sruti institution seeds must exist and be active');
  const plannedByTable=new Map(Object.keys(M95_EXPECTED).map(t=>[t,new Map(plan.items.filter(r=>r.tableName===t).map(r=>[r.key,r]))]));
  let existingMatched=0;
  for(const [table,rows] of Object.entries(targetRows))for(const item of rows){
    const planned=plannedByTable.get(table).get(item[M95_KEYS[table]]);
    if(!planned||!sameTransferredRecord(item,planned))fail(`Destination ${table} contains unexpected/modified data; stop and review before transfer`);
    existingMatched++;
  }
  const summary={milestone:'M9.5',mode,sourceRecords:plan.sourceTotal,selectedRecords:plan.items.length,
    excludedAuditRecords:plan.excludedAudit,sourceCounts:plan.sourceCounts,
    destinationCounts:plan.counts,alreadyTransferred:existingMatched,
    plannedNewWrites:plan.items.length-existingMatched,
    teacherIdentityLinksMerged:plan.teacherIdentityLinks,
    timeResolutionIssues:plan.time.localTimeConversion,
    referenceBlockers:plan.referenceBlockers,
    fingerprint:plan.fingerprint,legacyTablesModified:false,apiCutoverPerformed:false};
  if(mode==='dry-run')return {...summary,writesPerformed:0,readyForExecute:true};
  // Rescan source before the first write to detect changes during the preflight window.
  const fresh={};
  for(const [name,table] of Object.entries(SOURCE_TABLES))fresh[name]=await pageScan(doc,table);
  const confirm=prepareM95OperationalTransfer(fresh);
  if(!confirm.ready||confirm.fingerprint!==plan.fingerprint)fail('Source changed during preflight; rerun --dry-run');
  let written=0;
  // Write dependencies first. Conditions prevent overwrites; reruns accept exact matches only.
  const priority=['sadhana-dev-m9-people','sadhana-dev-m9-venues','sadhana-dev-m9-classes','sadhana-dev-m9-sessions','sadhana-dev-m9-events'];
  for(const planned of [...plan.items].sort((a,b)=>priority.indexOf(a.tableName)-priority.indexOf(b.tableName))){
    if(targetRows[planned.tableName].some(item=>item[M95_KEYS[planned.tableName]]===planned.key))continue;
    try{
      await doc.send(new PutCommand({TableName:planned.tableName,Item:planned.item,
        ConditionExpression:'attribute_not_exists(#pk)',ExpressionAttributeNames:{'#pk':planned.pk}}));
      written++;
    }catch(error){
      if(error?.name!=='ConditionalCheckFailedException')throw error;
      // Only accept an exact already-inserted record, never overwrite changed user data.
      const observed=await doc.send(new GetCommand({TableName:planned.tableName,Key:{[planned.pk]:planned.key},ConsistentRead:true}));
      if(!sameTransferredRecord(observed.Item,planned))throw Error(`Conflicting destination item in ${planned.tableName}; stop`);
    }
  }
  const verified={};
  for(const table of Object.keys(M95_EXPECTED)){
    const rows=await pageScan(doc,table,600);
    if(rows.length!==M95_EXPECTED[table])fail(`Post-write count mismatch in ${table}: ${rows.length}`);
    for(const item of rows){
      const planned=plannedByTable.get(table).get(item[M95_KEYS[table]]);
      if(!planned||!sameTransferredRecord(item,planned))fail(`Post-write verification failed in ${table}`);
    }
    verified[table]=rows.length;
  }
  return {...summary,writesPerformed:written,verifiedCounts:verified,verifiedTotal:Object.values(verified).reduce((a,b)=>a+b,0),apiCutoverPerformed:false};
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(process.env.AWS_PROFILE!=='default'||process.env.AWS_REGION!=='us-east-1'||process.env.SADHANA_DATA_MODE!=='split')fail('Require AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split');
  const ddb=new DynamoDBClient({region:'us-east-1'});
  const doc=DynamoDBDocumentClient.from(ddb,{marshallOptions:{removeUndefinedValues:true}});
  const result=await runTransfer({doc,mode:args.mode,describe:TableName=>ddb.send(new DescribeTableCommand({TableName}))});
  if(args.report){const path=resolve(args.report);writeFileSync(path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});chmodSync(path,0o600);}
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){
  main().catch(e=>{console.error('M9.5 TRANSFER STOP:',e.message);process.exitCode=1;});
}
