#!/usr/bin/env node
/** Read-only AWS scan + local private target record preview. NEVER writes to AWS. */
import {writeFileSync,chmodSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {SOURCE_TABLES,planMigration} from './m9MigrationPlannerCore.mjs';
import {previewTransform} from './m9TransformCore.mjs';
import {validateSchema} from './m9Schema.mjs';
async function main(){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--summary'||args[2]!=='--private-records')throw Error('Usage: node scripts/m9TransformationPreview.mjs --summary ./m9-target-summary.json --private-records ./m9-target-private.json');
 const summary=resolve(args[1]),privatePath=resolve(args[3]);if(summary===privatePath)throw Error('Summary and private output must differ');
 if(!process.env.AWS_PROFILE||process.env.AWS_REGION!=='us-east-1'||process.env.SADHANA_DATA_MODE!=='split')throw Error('Requires AWS_PROFILE, AWS_REGION=us-east-1, SADHANA_DATA_MODE=split');
 const schemaIssues=validateSchema();if(schemaIssues.length)throw Error(schemaIssues.join('; '));
 const {DynamoDBClient}=await import('@aws-sdk/client-dynamodb');
 const {DynamoDBDocumentClient,ScanCommand}=await import('@aws-sdk/lib-dynamodb');
 const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1'}));
 const tables={};
 for(const [domain,table] of Object.entries(SOURCE_TABLES)){
  const records=[];let cursor;do{
   const res=await db.send(new ScanCommand({TableName:table,ConsistentRead:true,Limit:100,ExclusiveStartKey:cursor}));
   records.push(...(res.Items??[]));cursor=res.LastEvaluatedKey;
   if(records.length>20000)throw Error(`Safety limit exceeded for ${table}`);
  }while(cursor);tables[domain]=records;
 }
 const plan=planMigration(tables),result=previewTransform(tables,plan);
 const safe={schema:1,readOnly:true,canExecute:false,sourceTotal:result.sourceTotal,targetItems:result.targetItems,byTable:result.byTable,planBlockers:result.planBlockers,transformFailures:result.transformFailures,failureCodes:Object.fromEntries([...new Set(result.failures.map(x=>x.code))].map(k=>[k,result.failures.filter(x=>x.code===k).length])),deferred:result.deferred,readyForWrites:false,notice:'DST conversion is preview-only; review deferred statuses, referential tests and backend integration before any write.'};
 for(const p of [summary,privatePath])mkdirSync(dirname(p),{recursive:true});
 writeFileSync(summary,JSON.stringify(safe,null,2)+'\n',{flag:'wx',mode:0o600});
 writeFileSync(privatePath,JSON.stringify({readOnly:true,canExecute:false,notice:'PRIVATE: contains historic data, staff/identity references and audit payloads. Never commit.',records:result.rows,failures:result.failures},null,2)+'\n',{flag:'wx',mode:0o600});
 chmodSync(summary,0o600);chmodSync(privatePath,0o600);
 console.log(JSON.stringify({summary,privateRecords:privatePath,...safe},null,2));
 if(plan.problems.length||result.failures.length)process.exitCode=2;
}
main().catch(e=>{console.error('M9.3 READ-ONLY STOP:',e.message);process.exitCode=1;});
