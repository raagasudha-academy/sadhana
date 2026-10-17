/**
 * One-time Sadhana calendar importer. AWS credentials are supplied only by the local
 * AWS CLI/SDK credential chain; never by browser, source code or Google Calendar.
 *
 * node --experimental-strip-types backend/scripts/importOneTimeSchedule.ts --table sadhana-dev-main
 * node --experimental-strip-types backend/scripts/importOneTimeSchedule.ts --table sadhana-dev-main --apply --confirm IMPORT-294
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { DynamoDBClient, DescribeContinuousBackupsCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { schedulePK, scheduleSK, validateScheduleRecord } from '../src/scheduleModel.ts';
import type { ScheduleRecord } from '../src/scheduleModel.ts';

const args=process.argv.slice(2);
const arg=(k:string)=>args[args.indexOf(k)+1];
const name=arg('--table');
const apply=args.includes('--apply');
if(!name||!/^sadhana-(dev|staging|prod)-main$/.test(name)){
 console.error('Usage: npm --prefix backend run import:calendar -- --table sadhana-dev-main [--apply --confirm IMPORT-294]');
 process.exit(2);
}
if(apply && (!args.includes('--confirm') || arg('--confirm')!=='IMPORT-294')){
 console.error('Import writes require --apply --confirm IMPORT-294.');process.exit(2);
}
const location=resolve(dirname(fileURLToPath(import.meta.url)),'../import-data/academy-calendar-v0.7.json');
const manifest=JSON.parse(readFileSync(location,'utf8')) as {manifestVersion:number;expected:{classes:number;events:number;total:number};classes:ScheduleRecord[];events:ScheduleRecord[]};
const records=[...manifest.classes,...manifest.events];
if(manifest.manifestVersion!==1||manifest.classes.length!==7||manifest.events.length!==287||records.length!==294||manifest.expected.total!==294)throw Error('Manifest failed fixed-count validation');
const keys=new Set<string>();
for(const record of records){validateScheduleRecord(record);const k=`${schedulePK(record.institution)}|${scheduleSK(record.id)}`;if(keys.has(k))throw Error('Duplicate Sadhana primary key');keys.add(k);}
const masters=new Set(manifest.classes.map(c=>c.id));
for(const e of manifest.events)if(e.recordType==='class-session'&&!masters.has(e.classId||''))throw Error('Orphan session: '+e.id);
const client=new DynamoDBClient({});
const db=DynamoDBDocumentClient.from(client,{marshallOptions:{removeUndefinedValues:true}});
if(apply){
 const backup=await client.send(new DescribeContinuousBackupsCommand({TableName:name}));
 if(backup.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus!=='ENABLED'){
  throw Error('Point-in-time recovery is not enabled for this DynamoDB table. Stop and enable backups before importing.');
 }
}
let exists=0,add=0,imported=0;
for(const record of records){
 const key={PK:schedulePK(record.institution),SK:scheduleSK(record.id)};
 const found=await db.send(new GetCommand({TableName:name,Key:key,ConsistentRead:true}));
 if(found.Item){exists++;continue;}add++;
 if(apply){
  const now=new Date().toISOString();
  try{
   await db.send(new PutCommand({TableName:name,Item:{...key,...record,entityType:'schedule',version:1,createdAt:now,updatedAt:now},ConditionExpression:'attribute_not_exists(PK) AND attribute_not_exists(SK)'}));
   imported++;
  }catch(e){if((e as Error).name==='ConditionalCheckFailedException'){exists++;add--;continue;}throw e;}
 }
}
console.log(JSON.stringify({mode:apply?'applied':'dry-run',table:name,expected:294,newRecords:add,alreadyExists:exists,written:imported,
 breakdown:{raagaSessions:216,srutiSessions:36,sharedHolidays:32,specialEvents:3,masterClasses:7}},null,2));
console.log(apply?'Sadhana now owns these imported records. Google Calendars were not accessed.':'Dry-run only: no DynamoDB writes. Enable PITR and use --apply --confirm IMPORT-294 after reviewing.');
