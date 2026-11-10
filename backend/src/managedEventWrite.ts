import {entityTable} from './entityTables.mjs';
/** M9.5 managed event writes. Opt-in; never writes through the legacy table router. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,permittedInstitutions,viewableInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {utcForWallTime} from './calendarWrite.ts';

type Client={send:(command:any)=>Promise<any>};
// Resolve lazily: final-mode acknowledgements are checked per request, not at cold start.
const EVENTS=()=>entityTable('events'),PEOPLE=()=>entityTable('people'),AUDIT=()=>entityTable('audit');
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const ID=/^[a-zA-Z0-9_-]{4,100}$/;
const allowed=new Set(['name','programme','eventKind','date','startTime','endTime','mode','location','venueId','teacherId']);

export function isPilotManagedEventRequest(method:string|undefined,parts:readonly string[]){
 return ['POST','PATCH','DELETE'].includes(method||'') && parts[0]==='events' &&
   ((parts.length===1&&method==='POST')||(parts.length===2&&parts[1]==='shared'&&method==='POST')||
    (parts.length===2&&parts[1]!=='shared'&&['PATCH','DELETE'].includes(method||''))||
    (parts.length===3&&parts[1]==='shared'&&['PATCH','DELETE'].includes(method||'')));
}
function enabled(){
 if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){
  if(process.env.SADHANA_FINAL_EVENT_WRITES!=='enabled'||process.env.SADHANA_ENTITY_FINAL_ACK!=='enabled'||process.env.SADHANA_DATA_MODE==='split')
   throw httpError(503,'Final managed event writes are disabled.');
  return;
 }
 if(process.env.M95_COMPAT_MODE!=='pilot'||process.env.M95_MANAGED_EVENT_WRITES!=='enabled')
  throw httpError(503,'M9 managed event writes are disabled.');
}
export function validateM95ManagedEvent(input:Record<string,unknown>,inst:InstitutionId){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.has(k)))throw httpError(400,'Invalid event fields.');
 if(input.eventKind!=='event'&&input.eventKind!=='class')throw httpError(400,'Choose an event type.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>150)throw httpError(400,'Enter an event name.');
 if(typeof input.date!=='string'||!DATE.test(input.date)||!Number.isFinite(Date.parse(`${input.date}T12:00:00Z`))||new Date(`${input.date}T12:00:00Z`).toISOString().slice(0,10)!==input.date)throw httpError(400,'Choose a valid event date.');
 if(typeof input.startTime!=='string'||typeof input.endTime!=='string'||!TIME.test(input.startTime)||!TIME.test(input.endTime)||input.startTime>=input.endTime)throw httpError(400,'Choose a valid same-day time range.');
 for(const key of ['programme','mode','location','venueId'])if(typeof input[key]!=='string'||(input[key] as string).length>300)throw httpError(400,`Invalid ${key}.`);
 if(input.eventKind==='event'){
  if(input.programme!=='Event'||input.mode!=='Event'||input.location!==''||input.venueId!==''||input.teacherId!==undefined)
   throw httpError(400,'Events must use the Event programme without a teacher, delivery or venue.');
 }else{
  const programmes=inst==='raaga'?['Singing']:['Vedam','Vedanta'];
  if(!programmes.includes(String(input.programme)))throw httpError(400,'Choose a programme permitted for this academy.');
  if(input.mode!=='Online'&&input.mode!=='In person')throw httpError(400,'Choose a delivery mode.');
  if(input.mode==='Online'&&(input.location!=='Online'||input.venueId!==''))throw httpError(400,'Online events must use Online as the venue.');
  if(input.mode==='In person'&&!input.venueId)throw httpError(400,'Choose an in-person venue.');
 }
 if(input.teacherId!==undefined&&(typeof input.teacherId!=='string'||!/^TEACHER-[0-9a-f-]{36}$/i.test(input.teacherId)))throw httpError(400,'Choose a registered teacher.');
 const startAt=utcForWallTime(input.date,input.startTime);
 const endAt=utcForWallTime(input.date,input.endTime);
 if(startAt>=endAt)throw httpError(400,'Invalid event time range.');
 return {...input,name:input.name.trim(),startAt,endAt} as {
  name: string;
  programme: string;
  eventKind: 'event' | 'class';
  date: string;
  startTime: string;
  endTime: string;
  mode: string;
  location: string;
  venueId: string;
  teacherId?: string;
  startAt: string;
  endAt: string;
 };
}
function effectiveVersion(row:Record<string,any>):number {
 const value=row.version??row.legacyPayload?.version;
 if(!Number.isInteger(value)||value<1)throw httpError(409,'Event version is missing.');
 return value;
}
function legacy(row:Record<string,any>){
 const {PK,SK,entityType,...rest}=row.legacyPayload||{};
 return rest;
}
function eventItem(raw:Record<string,any>,inst:InstitutionId,id:string,physicalId:string,actorSub:string,teacherId:string,teacherName:string,old?:Record<string,any>,sharedGroupId?:string){
 const now=new Date().toISOString();const version=old?effectiveVersion(old)+1:1;
 const oldRecord=old?.legacyPayload||{};
 const record={id,institution:inst,recordType:'special-event',managedEvent:true,
  ...(sharedGroupId?{sharedEvent:true}:{}),name:raw.name,programme:raw.programme,eventKind:raw.eventKind,
  teacherId,teacher:teacherName,date:raw.date,endDate:raw.date,startTime:raw.startTime,endTime:raw.endTime,
  allDay:false,mode:raw.mode,location:raw.location,venueId:raw.venueId,
  timezone:'Europe/London',status:'confirmed',version,
  createdAt:oldRecord.createdAt||now,createdBy:oldRecord.createdBy||actorSub,updatedAt:now,updatedBy:actorSub};
 const item: Record<string,any>={...old,eventId:physicalId,institutionId:inst,title:record.name,eventType:record.eventKind,
  managedEvent:true,status:record.status,version,localDate:record.date,localStartTime:record.startTime,
  localEndTime:record.endTime,timezone:record.timezone,startAt:raw.startAt,endAt:raw.endAt,
  updatedAt:now,createdAt:old?.createdAt||now,
  legacyPayload:{...oldRecord,...record,PK:`SCHEDULE#${inst}`,SK:`RECORD#${id}`,entityType:'schedule'},
  ...(sharedGroupId?{sharedGroupId}:{})};
 // GSI key types must never be NULL. Preserve other historical fields.
 if(raw.venueId)item.venueId=raw.venueId;else delete (item as Record<string,any>).venueId;
 return {record,item};
}
function eventAudit(inst:InstitutionId|string,id:string,actor:string,action:string,now:string){
 return {auditId:`m95_evt_${randomUUID()}`,institutionId:inst,action,actorCognitoSub:actor,
  resourceType:'event',resourceId:id,timestamp:now,schemaVersion:1};
}
function conditions(item:Record<string,any>,old?:Record<string,any>){
 return {TableName:EVENTS(),Item:item,ConditionExpression:old?(old.version===undefined?'attribute_not_exists(#v) AND #i=:inst':'#v=:old AND #i=:inst'):'attribute_not_exists(eventId)',
  ...(old?{ExpressionAttributeNames:{'#v':'version','#i':'institutionId'},ExpressionAttributeValues:{...(old.version===undefined?{}:{':old':old.version}),':inst':item.institutionId}}:{})};
}
export function makeM95ManagedEventWriter(client:Client){
 const scanPeople=async()=>{
  const rows:any[]=[];let cursor:Record<string,unknown>|undefined;
  do{const r=await client.send(new ScanCommand({TableName:PEOPLE(),ConsistentRead:true,Limit:250,ExclusiveStartKey:cursor}));rows.push(...r.Items||[]);cursor=r.LastEvaluatedKey;if(rows.length>1500)throw httpError(409,'Teacher directory exceeds safe lookup limit.');}while(cursor);
  return rows;
 };
 const teacher=async(inst:InstitutionId,claims:Claims)=>{
  if(!viewableInstitutions(claims).includes(inst))throw httpError(403,'Institution access required.');
  const admin=permittedInstitutions(claims).includes(inst);
  if(admin)return {admin:true,self:undefined as any};
  const rows=(await scanPeople()).filter(row=>row.cognitoSub===claims.sub&&row.status==='active'&&row.personTypes?.includes('teacher')&&row.institutionIds?.includes(inst));
  if(rows.length!==1)throw httpError(403,'Verified active teacher link required.');
  return {admin:false,self:rows[0]};
 };
 const assignee=async(inst:InstitutionId,id:string)=>{
  const res=await client.send(new GetCommand({TableName:PEOPLE(),Key:{personId:id},ConsistentRead:true}));
  const row=res.Item;
  if(!row||row.status!=='active'||!row.personTypes?.includes('teacher')||!row.institutionIds?.includes(inst))throw httpError(400,'Choose an active teacher in this academy.');
  return row;
 };
 const get=async(inst:InstitutionId,id:string)=>{
  const res=await client.send(new GetCommand({TableName:EVENTS(),Key:{eventId:id},ConsistentRead:true}));
  const row=res.Item;
  if(!row||row.institutionId!==inst||!row.managedEvent||row.legacyPayload?.recordType!=='special-event'||row.legacyPayload?.sharedEvent)
   throw httpError(404,'Managed event not found.');
  return row;
 };
 const write=async(items:{item:Record<string,any>;old?:Record<string,any>}[],auditInst:string,id:string,sub:string,action:string)=>{
  const now=new Date().toISOString();
  try{await client.send(new TransactWriteCommand({TransactItems:[
   ...items.map(({item,old})=>({Put:conditions(item,old)})),
   {Put:{TableName:AUDIT(),Item:eventAudit(auditInst,id,sub,action,now),ConditionExpression:'attribute_not_exists(auditId)'}}
  ]}));}catch(e){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes((e as Error).name))throw httpError(409,'Event changed or already exists. Refresh and retry.');throw e;}
 };
 return {
  async save(inst:InstitutionId,claims:Claims,input:Record<string,unknown>,id?:string){
   enabled();const {admin,self}=await teacher(inst,claims);
   if(!input||Array.isArray(input)||typeof input!=='object')throw httpError(400,'Invalid event.');
   const {expectedVersion,...fields}=input;
   const raw=validateM95ManagedEvent(fields,inst);
   if(admin&&raw.eventKind==='class'&&!raw.teacherId)throw httpError(400,'Choose a registered teacher.');
   if(!admin&&raw.teacherId!==undefined&&raw.teacherId!==self.personId)throw httpError(403,'Teachers may assign events only to themselves.');
   const assignedId=raw.eventKind==='event'?(admin?'':self?.personId):admin?String(raw.teacherId):self.personId;
   const assigned=assignedId?await assignee(inst,assignedId):undefined;
   const old=id?await get(inst,id):undefined;
   if(old){if(!Number.isInteger(expectedVersion)||expectedVersion!==effectiveVersion(old))throw httpError(409,'Event changed; refresh.');
    if(!admin&&old.legacyPayload?.teacherId!==self.personId)throw httpError(403,'You can edit only your own events.');
   }else if(expectedVersion!==undefined)throw httpError(400,'Unexpected event version.');
   const eventId=id||`EVT-${randomUUID()}`;
   if(!ID.test(eventId))throw httpError(400,'Invalid event ID.');
   const {item,record}=eventItem(raw,inst,eventId,eventId,String(claims.sub),assignedId,assigned?.displayName||'',old);
   await write([{item,old}],inst,eventId,String(claims.sub),old?'M95_UPDATE_MANAGED_EVENT':'M95_CREATE_MANAGED_EVENT');
   return {record};
  },
  async cancel(inst:InstitutionId,claims:Claims,id:string,expectedVersion:unknown){
   enabled();const {admin,self}=await teacher(inst,claims);
   if(!ID.test(id))throw httpError(400,'Invalid event ID.');
   const old=await get(inst,id);
   if(!Number.isInteger(expectedVersion)||effectiveVersion(old)!==expectedVersion)throw httpError(409,'Event changed; refresh.');
   if(!admin&&old.legacyPayload?.teacherId!==self.personId)throw httpError(403,'You can cancel only your own events.');
   const now=new Date().toISOString(),record={...legacy(old),status:'cancelled',version:effectiveVersion(old)+1,updatedAt:now,updatedBy:String(claims.sub)};
   const item={...old,status:'cancelled',version:record.version,updatedAt:now,legacyPayload:{...old.legacyPayload,...record}};
   await write([{item,old}],inst,id,String(claims.sub),'M95_CANCEL_MANAGED_EVENT');
   return {record};
  },
  async shared(claims:Claims,input:Record<string,unknown>,id?:string,cancel=false){
   enabled();const perms=permittedInstitutions(claims);
   if(!perms.includes('raaga')||!perms.includes('sruti'))throw httpError(403,'Shared events require both academy administrator roles.');
   if(!input||Array.isArray(input)||typeof input!=='object')throw httpError(400,'Invalid shared event.');
   const {expectedVersion,...fields}=input;
   if(id&&!ID.test(id))throw httpError(400,'Invalid event ID.');
   const old= id? await Promise.all((['raaga','sruti'] as const).map(async inst=>{
    const result=await client.send(new GetCommand({TableName:EVENTS(),Key:{eventId:`${id}__${inst}`},ConsistentRead:true}));return result.Item;
   })):undefined;
   if(id&&(!old||old.some((row,index)=>!row||row.institutionId!==(['raaga','sruti'][index])||row.sharedGroupId!==id||row.legacyPayload?.id!==id||row.legacyPayload?.sharedEvent!==true)||effectiveVersion(old[0])!==effectiveVersion(old[1])))throw httpError(409,'Shared event pair is incomplete or inconsistent.');
   if(id&&(!Number.isInteger(expectedVersion)||effectiveVersion(old![0])!==expectedVersion))throw httpError(409,'Shared event changed; refresh.');
   if(!id&&expectedVersion!==undefined)throw httpError(400,'Unexpected event version.');
   const eventId=id||`EVT-${randomUUID()}`;
   let rows:{item:Record<string,any>;old?:Record<string,any>;record:Record<string,any>}[];
   if(cancel){
    if(!old)throw httpError(404,'Shared event not found.');
    const now=new Date().toISOString();
    rows=old.map((previous)=>{
     const record={...legacy(previous),status:'cancelled',version:effectiveVersion(previous)+1,updatedAt:now,updatedBy:String(claims.sub)};
     return {old:previous,item:{...previous,status:'cancelled',version:record.version,updatedAt:now,legacyPayload:{...previous.legacyPayload,...record}},record};
    });
   }else{
    const raw=validateM95ManagedEvent(fields,'raaga');
    if(raw.eventKind!=='event')throw httpError(400,'Only Event programme may be shared.');
    rows=(['raaga','sruti'] as const).map((inst,index)=>{
     const {item,record}=eventItem(raw,inst,eventId,`${eventId}__${inst}`,String(claims.sub),'','',old?.[index],eventId);
     return {item,record,old:old?.[index]};
    });
   }
   await write(rows,'shared',eventId,String(claims.sub),cancel?'M95_CANCEL_SHARED_EVENT':id?'M95_UPDATE_SHARED_EVENT':'M95_CREATE_SHARED_EVENT');
   return {record:rows[0].record,records:rows.map(x=>x.record)};
  }
 };
}
export function defaultM95ManagedEventWriter(){
 return makeM95ManagedEventWriter(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));
}
