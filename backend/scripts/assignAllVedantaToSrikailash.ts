/**
 * One-off Sadhana migration: assign every Sruti/Raaga Vedanta master class,
 * its stored dated sessions, and its effective-dated rules to Srikailash.
 * Dry-run by default. Requires --apply to write.
 * Backups are saved locally before writes. No deletes or re-imports.
 * Execute from ~/Dev/sadhana/backend with tsx.
 */
import {randomUUID} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, QueryCommand, TransactWriteCommand} from '@aws-sdk/lib-dynamodb';

const ID='TEACHER-8a013a2f-2b03-471b-b74e-3619e6a4bfd1';
const NAME='Mr Srikailash Venkitadri';
const args=process.argv.slice(2);
const param=(flag:string)=>{const at=args.indexOf(flag);return at<0?undefined:args[at+1];};
const table=param('--table');
const apply=args.includes('--apply');
if(!table||!/^[a-zA-Z0-9_.-]{3,255}$/.test(table))throw Error('Usage: npx tsx scripts/assignAllVedantaToSrikailash.ts --table sadhana-dev-main [--apply]');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const queryPartition=async(pk:string)=>{
 const rows:any[]=[];let next:Record<string,any>|undefined;
 do{
  const r=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':pk},ConsistentRead:true,ExclusiveStartKey:next}));
  rows.push(...(r.Items||[]));next=r.LastEvaluatedKey;
 }while(next);
 return rows;
};
const institutions=['sruti','raaga'] as const;
const schedules=(await Promise.all(institutions.map(async inst=>({inst,rows:await queryPartition(`SCHEDULE#${inst}`)}))));
const series=(await Promise.all(institutions.map(async inst=>({inst,rows:await queryPartition(`SCHEDULE_SERIES#${inst}`)}))));
const edits:{type:'schedule'|'rule';institution:string;item:any}[]=[];
const summary:any[]=[];
for(const {inst,rows} of schedules){
 const masters=rows.filter(r=>r.recordType==='class'&&/vedanta/i.test(`${r.name||''} ${r.programme||''}`));
 const ids=new Set(masters.map(m=>m.id));
 const sessions=rows.filter(r=>r.recordType==='class-session'&&ids.has(r.classId));
 const rules=(series.find(s=>s.inst===inst)?.rows||[]).filter(r=>ids.has(r.classId));
 // Abort if a named Vedanta session is attached to a master the discovery missed.
 const suspicious=rows.filter(r=>r.recordType==='class-session'&&/vedanta/i.test(`${r.name||''} ${r.programme||''}`)&&!ids.has(r.classId));
 if(suspicious.length)throw Error(`${inst}: ${suspicious.length} Vedanta sessions have no identified Vedanta master; review before applying.`);
 for(const item of [...masters,...sessions]){
  if(!Number.isInteger(item.version))throw Error(`No numeric version on ${inst}/${item.id}`);
  if(item.teacher!==NAME||item.teacherId!==ID)edits.push({type:'schedule',institution:inst,item});
 }
 for(const item of rules){
  if(typeof item.updatedAt!=='string'||!item.changes||typeof item.changes!=='object')throw Error(`Malformed series rule ${inst}/${item.SK}`);
  if(item.changes.teacher!==NAME||item.changes.teacherId!==ID)edits.push({type:'rule',institution:inst,item});
 }
 summary.push({institution:inst,masters:masters.map(m=>({id:m.id,name:m.name,programme:m.programme})),datedSessions:sessions.length,seriesRules:rules.length});
}
console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',table,assignTo:{name:NAME,id:ID},scope:summary,recordsToUpdate:edits.length,breakdown:{masters:edits.filter(e=>e.type==='schedule'&&e.item.recordType==='class').length,sessions:edits.filter(e=>e.type==='schedule'&&e.item.recordType==='class-session').length,rules:edits.filter(e=>e.type==='rule').length}},null,2));
if(!summary.some(s=>s.masters.some((m:any)=>m.id==='CLASS-SRUTI-NEWCASTLE-VEDANTA')))throw Error('Expected Newcastle Vedanta master not found; aborting.');
if(!apply){console.log('DRY RUN ONLY. Re-run with --apply after reviewing the above target list.');process.exit(0);}
if(edits.length===0){console.log('No changes needed.');process.exit(0);}
// Transaction limit: 100 items, plus one audit row. Fail closed rather than partially apply.
if(edits.length+1>100)throw Error(`Too many items for a single atomic transaction (${edits.length}); split by reviewed class before applying.`);
const now=new Date().toISOString();
mkdirSync('../sadhana-vedanta-backups',{recursive:true});
const path=`../sadhana-vedanta-backups/vedanta-before-${now.replace(/[:.]/g,'-')}.json`;
writeFileSync(path,JSON.stringify({table,createdAt:now,assignTo:{NAME,ID},scope:summary,originals:edits.map(x=>({type:x.type,institution:x.institution,item:x.item}))},null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Original records backed up:',path);
const transaction:any[]=edits.map(({type,item})=>{
 if(type==='schedule')return {Update:{TableName:table,Key:{PK:item.PK,SK:item.SK},
  UpdateExpression:'SET #teacher=:name, teacherId=:id, #version=:next, updatedAt=:now',
  ConditionExpression:'#version=:old AND #recordType=:recordType',
  ExpressionAttributeNames:{'#teacher':'teacher','#version':'version','#recordType':'recordType'},
  ExpressionAttributeValues:{':name':NAME,':id':ID,':next':item.version+1,':old':item.version,':recordType':item.recordType,':now':now}}};
 return {Update:{TableName:table,Key:{PK:item.PK,SK:item.SK},
  UpdateExpression:'SET #changes.#teacher=:name, #changes.#teacherId=:id, updatedAt=:now',
  ConditionExpression:'updatedAt=:oldUpdatedAt AND entityType=:type',
  ExpressionAttributeNames:{'#changes':'changes','#teacher':'teacher','#teacherId':'teacherId'},
  ExpressionAttributeValues:{':name':NAME,':id':ID,':now':now,':oldUpdatedAt':item.updatedAt,':type':'scheduleSeriesRule'}}};
});
transaction.push({Put:{TableName:table,Item:{PK:'AUDIT#sruti',SK:`VEDANTA-TEACHER-NORMALISE#${now}#${randomUUID()}`,entityType:'audit',action:'assignVedantaToSrikailash',at:now,teacherId:ID,teacherName:NAME,changed:edits.map(e=>({PK:e.item.PK,SK:e.item.SK}))},ConditionExpression:'attribute_not_exists(PK)'}});
await db.send(new TransactWriteCommand({TransactItems:transaction}));
console.log(`SUCCESS: atomically updated ${edits.length} records. No venue or unrelated calendar records changed.`);
