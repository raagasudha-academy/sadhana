/** One-time, explicitly requested Sruti online sessions for 17 Nov–2 Dec 2026.
 * Google has no "Online Session" markers in this period; this is a staff
 * override, not a generated marker. DRY RUN unless --apply --confirm SRUTI-12.
 * Run from project root using backend/node_modules/.bin/tsx.
 */
import {randomUUID,createHash} from 'node:crypto';
import {DynamoDBClient,DescribeContinuousBackupsCommand} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand,PutCommand} from '@aws-sdk/lib-dynamodb';
import {makeSrutiExceptionPlan,ONLINE_SYNC_OWNER,SRUTI_EXCEPTION_ID} from '../src/onlineClasses.ts';
import {schedulePK,scheduleSK} from '../src/scheduleModel.ts';
const args=process.argv.slice(2);
const flag=(name:string)=>{const n=args.indexOf(name);return n>=0?args[n+1]||'':'';};
const table=flag('--table');
const apply=args.includes('--apply');
if(table!=='sadhana-dev-main')throw Error('Safety stop: expected --table sadhana-dev-main');
if(apply&&flag('--confirm')!=='SRUTI-12')throw Error('Writes require --apply --confirm SRUTI-12');
const plan=makeSrutiExceptionPlan();
if(plan.masters.length!==5||plan.sessions.length!==12||
 plan.sessions.some(x=>x.institution!=='sruti'||x.date!<'2026-11-17'||x.date!>'2026-12-02'))
 throw Error('Unexpected exception plan; no writes.');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const current:Record<string,any>[]=[];let next:Record<string,any>|undefined;
do{
 const page=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':schedulePK('sruti')},ConsistentRead:true,ExclusiveStartKey:next,Limit:250}));
 current.push(...(page.Items||[]));next=page.LastEvaluatedKey;
 if(current.length>6000)throw Error('Too many Sruti schedule records; no writes.');
}while(next);
const byId=new Map(current.map(x=>[x.id,x]));
const addMasters:Record<string,any>[]=[];
const addSessions:Record<string,any>[]=[];
let unchanged=0;
function digest(x:Record<string,any>):string{
 return createHash('sha256').update(JSON.stringify([x.id,x.recordType,x.institution,x.classId||'',x.date||'',x.name,x.programme,x.teacher,x.mode,x.location,x.startTime,x.endTime,x.timezone])).digest('hex');
}
for(const [kind,items] of [['master',plan.masters],['session',plan.sessions]] as const){
 for(const desired of items){
  const found=byId.get(desired.id);
  if(!found){(kind==='master'?addMasters:addSessions).push(desired);continue;}
  if(found.PK!==schedulePK('sruti')||found.SK!==scheduleSK(found.id)||
     found.syncOwner!==ONLINE_SYNC_OWNER||digest(found)!==digest(desired)||
     (kind==='session'&&(!found.manualException||found.status!=='confirmed'))){
   throw Error(`Existing record ${desired.id} differs from expected ${kind}; stop and review. No writes.`);
  }
  unchanged++;
 }
}
const output={mode:apply?'APPLY':'READ_ONLY_PREVIEW',table,exception:SRUTI_EXCEPTION_ID,
 intervalInclusive:['2026-11-17','2026-12-02'],
 newMasterClasses:addMasters.length,newSessions:addSessions.length,unchanged,
 requestedTotal:plan.sessions.length,
 byGroup:plan.masters.map(m=>({name:m.name,teacher:m.teacher,dates:plan.sessions.filter(s=>s.classId===m.id).map(s=>s.date)})),
 sessionDates:[...new Set(plan.sessions.map(s=>s.date))].sort(),
 existingCalendarRecordsUntouched:true};
console.log(JSON.stringify(output,null,2));
if(!apply){console.log('DRY RUN: no AWS writes.');process.exit(0);}
const pitr=await new DynamoDBClient({}).send(new DescribeContinuousBackupsCommand({TableName:table}));
if(pitr.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus!=='ENABLED')
 throw Error('PITR must be enabled. No writes.');
const now=new Date().toISOString();let written=0;
for(const item of [...addMasters,...addSessions]){
 const body={...item,PK:schedulePK('sruti'),SK:scheduleSK(item.id),entityType:'schedule',
  version:1,syncVersion:1,createdAt:now,updatedAt:now,
  ...(item.recordType==='class-session'?{sourceCalendar:'manual-sruti-exception',manualException:SRUTI_EXCEPTION_ID}:
    {sourceCalendar:'online-class-catalogue'})};
 await db.send(new PutCommand({TableName:table,Item:body,ConditionExpression:'attribute_not_exists(PK) AND attribute_not_exists(SK)'}));
 written++;
}
if(written)await db.send(new PutCommand({TableName:table,Item:{
 PK:'AUDIT#sruti',SK:`ONLINE-EXCEPTION#${now}#${randomUUID()}`,entityType:'audit',
 action:'addSrutiNovDec2026OnlineSessions',at:now,exception:SRUTI_EXCEPTION_ID,recordsWritten:written,
 },ConditionExpression:'attribute_not_exists(PK)'}));
console.log(JSON.stringify({status:'APPLIED',created:written,newMasters:addMasters.length,newSessions:addSessions.length,
 idempotent:true,original294Untouched:true},null,2));
