/** READ ONLY. Prove all original 294 calendar keys survive the v0.7.4 import.
 * Earlier verifyVenueLinks.ts expects exactly 294 and therefore cannot verify
 * the *expanded* timetable after intentionally adding online sessions.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,QueryCommand} from '@aws-sdk/lib-dynamodb';
const args=process.argv.slice(2);
const flag=(key:string)=>{const i=args.indexOf(key);return i<0?'':args[i+1]||'';};
const table=flag('--table');
const baseline=flag('--original-baseline');
if(table!=='sadhana-dev-main'||!baseline)throw Error('Usage: --table sadhana-dev-main --original-baseline .sadhana-calendar-before-v073.json');
const previous=JSON.parse(readFileSync(baseline,'utf8')) as {table:string;calendarCount:number;snapshot:Array<{PK:string;SK:string;hash:string}>};
if(previous.table!==table||previous.calendarCount!==294||previous.snapshot.length!==294)throw Error('This is not the expected 294-record original baseline.');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const items:Record<string,any>[]=[];
for(const inst of ['raaga','sruti','shared']){
 let next:Record<string,any>|undefined;
 do{
  const page=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`SCHEDULE#${inst}`},ConsistentRead:true,ExclusiveStartKey:next}));
  items.push(...(page.Items||[]));next=page.LastEvaluatedKey;
 }while(next);
}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const map=new Map(items.map(x=>[`${x.PK}/${x.SK}`,x]));
const missing:string[]=[];const unexpectedChanges:string[]=[];const teacherChanges:string[]=[];
const vedantaId='CLASS-SRUTI-NEWCASTLE-VEDANTA';
for(const old of previous.snapshot){
 const key=`${old.PK}/${old.SK}`;
 const record=map.get(key);
 if(!record){missing.push(key);continue;}
 if(hash(canonical(record))===old.hash)continue;
 if(record.PK==='SCHEDULE#sruti'&&record.recordType==='class'&&record.id===vedantaId ||
    record.PK==='SCHEDULE#sruti'&&record.recordType==='class-session'&&record.classId===vedantaId){
   if(record.teacher==='Mr Srikailash Venkitadri')teacherChanges.push(key);
   else unexpectedChanges.push(key+' (Vedanta teacher not assigned)');
 } else unexpectedChanges.push(key);
}
const originalKeys=new Set(previous.snapshot.map(x=>`${x.PK}/${x.SK}`));
const newRecords=items.filter(x=>!originalKeys.has(`${x.PK}/${x.SK}`));
const unknownNew=newRecords.filter(x=>x.syncOwner!=='online-calendar-v074');
const onlineMasters=newRecords.filter(x=>x.syncOwner==='online-calendar-v074'&&x.recordType==='class');
const onlineSessions=newRecords.filter(x=>x.syncOwner==='online-calendar-v074'&&x.recordType==='class-session');
const brokenSessions=onlineSessions.filter(s=>!map.has(`${s.PK}/RECORD#${s.classId}`)||s.mode!=='Online'||s.location!=='Online');
const manualExceptions=onlineSessions.filter(s=>s.manualException==='sruti-online-novdec-2026');
const invalidManual=manualExceptions.filter(s=>s.institution!=='sruti'||s.date<'2026-11-17'||s.date>'2026-12-02'||s.status!=='confirmed');
const uniqueIds=new Set(onlineSessions.map(s=>`${s.PK}/${s.SK}`));
const duplicateClassDates=new Map<string,number>();
for(const s of onlineSessions){const key=`${s.institution}/${s.classId}/${s.date}`;duplicateClassDates.set(key,(duplicateClassDates.get(key)||0)+1);}
const repeated=[...duplicateClassDates].filter(([,n])=>n!==1);
const ok=missing.length===0&&unexpectedChanges.length===0&&unknownNew.length===0&&brokenSessions.length===0&&onlineMasters.length===15&&manualExceptions.length===12&&invalidManual.length===0&&repeated.length===0&&uniqueIds.size===onlineSessions.length;
console.log(JSON.stringify({mode:'READ_ONLY',originalCount:previous.snapshot.length,originalRecordsPresent:294-missing.length,vedantaRecordsUpdated:teacherChanges.length,unexpectedOriginalChanges:unexpectedChanges.length,newOnlineMasters:onlineMasters.length,newOnlineSessions:onlineSessions.length,manualSrutiExceptions:manualExceptions.length,invalidManualExceptions:invalidManual.length,duplicateOnlineClassDates:repeated.length,unexpectedNewRecords:unknownNew.length,brokenOnlineLinks:brokenSessions.length,totalScheduleRecords:items.length,ok,issues:[...missing,...unexpectedChanges,...unknownNew.map(x=>x.id),...brokenSessions.map(x=>x.id),...invalidManual.map(x=>x.id),...repeated.map(([k])=>k)].slice(0,20)},null,2));
if(!ok)process.exitCode=2;
