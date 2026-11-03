/** M9.5 compatibility reader for the transferred operational setup.
 * Deliberately separate from the current PK/SK tableRouter. Read-only.
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {projectSeriesRecord} from './scheduleSeries.ts';
import type {SeriesRule} from './scheduleSeries.ts';
import type {ScheduleInstitution,ScheduleRecord} from './scheduleModel.ts';

export type CompatibleEntity='classes'|'sessions'|'events'|'venues'|'people';
export type CompatibleItem={institutionId?:string;institutionIds?:string[];recordType?:string;legacyPayload?:Record<string,any>};
export type CompatClient={send:(command:any)=>Promise<any>};
const limits:Record<CompatibleEntity,number>={classes:1500,sessions:6000,events:1500,venues:500,people:1000};
export function legacyRecord(item:CompatibleItem):Record<string,any>{
 if(!item || !item.legacyPayload || typeof item.legacyPayload!=='object' || Array.isArray(item.legacyPayload))
  throw Error('M9_COMPAT_MISSING_LEGACY_PAYLOAD');
 const {PK,SK,entityType,...fields}=item.legacyPayload;
 if(typeof fields.id!=='string'||!fields.id)throw Error('M9_COMPAT_MISSING_LEGACY_ID');
 return fields;
}
export function assembleSchedule(inst:ScheduleInstitution,classes:CompatibleItem[],sessions:CompatibleItem[],events:CompatibleItem[]=[]):{records:ScheduleRecord[];more:false;source:string}{
 // The legacy SCHEDULE partition included special events. M9 stores them separately.
 const regular=[...classes,...sessions,...events.filter(item=>item.legacyPayload?.recordType==='special-event')].filter(item=>item.institutionId===inst && item.recordType!=='series-change')
  .map(item=>legacyRecord(item) as ScheduleRecord);
 if(inst==='shared')return {records:regular.filter(r=>r.recordType==='holiday'||r.recordType==='special-event'),more:false,source:'Sadhana DynamoDB'};
 const rules=sessions.filter(x=>x.institutionId===inst&&x.recordType==='series-change').map(x=>{
  const raw=x.legacyPayload;
  if(!raw||typeof raw.classId!=='string'||typeof raw.effectiveFrom!=='string'||!raw.changes)throw Error('M9_COMPAT_INVALID_SERIES_RULE');
  return raw as SeriesRule;
 });
 return {records:regular.map(r=>projectSeriesRecord(r,rules)),more:false,source:'Sadhana DynamoDB'};
}
export function assembleManagedEvents(inst:'raaga'|'sruti',items:CompatibleItem[]):{records:Record<string,any>[]} {
 return {records:items.filter(x=>x.institutionId===inst).map(x=>legacyRecord(x))
  .filter(x=>x.recordType==='special-event'&&x.managedEvent===true)};
}
export function canonicalRecords(rows:ReadonlyArray<object>):string{
 const ordered=rows.map(row=>JSON.stringify(sortDeep(row))).sort();return JSON.stringify(ordered);
}
function sortDeep(value:any):any{
 if(Array.isArray(value))return value.map(sortDeep);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortDeep(value[k])]));
 return value;
}
export function makeM95CompatibilityReader(client:CompatClient){
 const scan=async(entity:CompatibleEntity):Promise<CompatibleItem[]>=>{
  const rows:CompatibleItem[]=[];let cursor:Record<string,unknown>|undefined;
  do{
   const result=await client.send(new ScanCommand({TableName:`sadhana-dev-m9-${entity}`,ConsistentRead:true,ExclusiveStartKey:cursor,Limit:250}));
   rows.push(...(result.Items??[]));cursor=result.LastEvaluatedKey;
   if(rows.length>limits[entity])throw Error(`M9_COMPAT_LIMIT_EXCEEDED_${entity}`);
  }while(cursor);
  return rows;
 };
 return {
  async schedule(inst:ScheduleInstitution){const [classes,sessions,events]=await Promise.all([scan('classes'),scan('sessions'),scan('events')]);return assembleSchedule(inst,classes,sessions,events);},
  async managedEvents(inst:'raaga'|'sruti'){return assembleManagedEvents(inst,await scan('events'));},
  async inventory(){const [classes,sessions,events,venues,people]=await Promise.all(['classes','sessions','events','venues','people'].map(x=>scan(x as CompatibleEntity)));
   return {classes:classes.length,sessions:sessions.length,events:events.length,venues:venues.length,people:people.length};}
 };
}
export type M95Reader=ReturnType<typeof makeM95CompatibilityReader>;
export function defaultM95Reader():M95Reader{
 const client=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
 return makeM95CompatibilityReader(client);
}
