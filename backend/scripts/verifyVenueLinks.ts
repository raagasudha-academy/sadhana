/** READ ONLY — inspect imported timetable and venue FK integrity. Never writes DynamoDB. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { VENUES } from '../src/academyVenues.ts';
import { schedulePK, scheduleSK } from '../src/scheduleModel.ts';
import type { ScheduleInstitution } from '../src/scheduleModel.ts';

const args=process.argv.slice(2);
const flag=(k:string)=>{const pos=args.indexOf(k);return pos<0?'':args[pos+1]||'';};
const table=flag('--table')||process.env.SADHANA_TABLE_NAME;
if(!table||!/^[a-zA-Z0-9_.-]{3,255}$/.test(table))throw Error('Pass --table sadhana-dev-main');
const baseline=flag('--baseline'),compare=flag('--compare');
if(baseline&&compare)throw Error('Use --baseline or --compare, not both');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const readSchedule=async(inst:ScheduleInstitution)=>{
 const items:Record<string,any>[]=[];let start:Record<string,any>|undefined;
 do{
  const page=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ExclusiveStartKey:start,ConsistentRead:true}));
  items.push(...(page.Items||[]));start=page.LastEvaluatedKey;
 }while(start);
 return items;
};
const [raaga,sruti,shared]=await Promise.all([readSchedule('raaga'),readSchedule('sruti'),readSchedule('shared')]);
const all=[...raaga,...sruti,...shared];
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const sha=(obj:unknown)=>createHash('sha256').update(JSON.stringify(canonical(obj))).digest('hex');
const snapshot=all.map(item=>({PK:item.PK,SK:item.SK,hash:sha(item)})).sort((a,b)=>`${a.PK}/${a.SK}`.localeCompare(`${b.PK}/${b.SK}`));
const fingerprint=sha(snapshot);
const venueResults=[];
for(const venue of VENUES){
 const record=await db.send(new GetCommand({TableName:table,Key:{PK:`VENUE#${venue.id}`,SK:'META'},ConsistentRead:true}));
 const masters=all.filter(r=>r.recordType==='class'&&venue.masterIds.some(id=>id===r.id));
 const sessions=all.filter(r=>r.recordType==='class-session'&&venue.masterIds.some(id=>id===r.classId));
 const unmatched=[...masters,...sessions].filter(r=>r.venueId!==venue.id).map(r=>r.id);
 venueResults.push({id:venue.id,exists:!!record.Item,name:record.Item?.name??null,masterCount:masters.length,sessionCount:sessions.length,linkedCount:masters.length+sessions.length-unmatched.length,unlinkedCount:unmatched.length,unlinkedExampleIds:unmatched.slice(0,4)});
}
const counts=Object.fromEntries(['class','class-session','holiday','special-event'].map(type=>[type,all.filter(x=>x.recordType===type).length]));
const expected={class:7,'class-session':252,holiday:32,'special-event':3};
const countOK=all.length===294&&Object.keys(expected).every(k=>counts[k]===expected[k]);
const linkOK=venueResults.every(v=>v.exists&&v.unlinkedCount===0)&&venueResults.reduce((s,v)=>s+v.linkedCount,0)===259;
const results={mode:'READ_ONLY',table,calendarCount:all.length,expectedCalendarCount:294,counts,expectedCounts:expected,venues:venueResults,countOK,linkOK,scheduleFingerprint:fingerprint};
console.log(JSON.stringify(results,null,2));
if(baseline){
 if(!countOK||!linkOK)throw Error('Live calendar/venue verification failed; refusing to write a passing baseline. Fix links first.');
 writeFileSync(baseline,JSON.stringify({table,calendarCount:all.length,fingerprint,snapshot},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Local read-only baseline saved:',baseline);
}
if(compare){
 const previous=JSON.parse(readFileSync(compare,'utf8'));
 const intact=previous.table===table&&previous.calendarCount===all.length&&previous.fingerprint===fingerprint;
 console.log(JSON.stringify({calendarUnchangedSinceBaseline:intact,baseline:compare},null,2));
 if(!intact)process.exitCode=2;
}
if(!countOK||!linkOK)process.exitCode=2;
