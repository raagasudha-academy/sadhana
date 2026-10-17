import {makeRoutedClient} from './tableRouter.ts';
/** Academy-owned timetable CRUD. No reads or writes to Google Calendar. */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { demandAnyStaff, demandAnyAdmin, demandInstitution, demandViewInstitution, httpError, permittedInstitutions } from './model.ts';
import type { Claims } from './model.ts';
import { scheduleChanges, schedulePK, scheduleSK, validateScheduleRecord } from './scheduleModel.ts';
import type {ScheduleInstitution,ScheduleRecord} from './scheduleModel.ts';
import {parseSeriesChange,projectSeriesRecord,seriesPK,seriesSK,todayLondon,validateSeriesCandidate} from './scheduleSeries.ts';
import {matchesTeacherName} from './teacherNameMatch.ts';
import type {SeriesRule} from './scheduleSeries.ts';
import {calculateSeriesImpact} from './calendarImpact.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing DynamoDB table name');return process.env.SADHANA_TABLE_NAME;};
function canAccess(claims:Claims,inst:ScheduleInstitution,writing=false){
 if(inst==='shared'){
  demandAnyStaff(claims);
  // Sharing a calendar for display does not grant shared-event editing rights.
  if(writing&&permittedInstitutions(claims).length!==2)throw httpError(403,'Shared events require a dual-academy administrator.');
 } else if(writing)demandInstitution(claims,inst);
 else demandViewInstitution(claims,inst);
}
function toPublic(item:Record<string,any>):ScheduleRecord {
 const {PK,SK,entityType,...fields}=item;return fields as ScheduleRecord;
}
async function listSeriesRules(inst:Exclude<ScheduleInstitution,'shared'>):Promise<SeriesRule[]> {
 const rules:SeriesRule[]=[];let next:Record<string,unknown>|undefined;
 do{
  const response=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':seriesPK(inst)},ExclusiveStartKey:next,Limit:250}));
  rules.push(...(response.Items||[]).map(x=>x as SeriesRule));next=response.LastEvaluatedKey;
  if(rules.length>2000)throw httpError(413,'Too many historical class changes.');
 }while(next);
 return rules;
}
export async function listSchedule(inst:ScheduleInstitution,claims:Claims) {
 canAccess(claims,inst);
 const items:ScheduleRecord[]=[];let next:Record<string,unknown>|undefined;
 do {
  const response=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ExclusiveStartKey:next,Limit:250}));
  items.push(...(response.Items||[]).map(x=>toPublic(x)));
  next=response.LastEvaluatedKey;
  if(items.length>3000)throw httpError(413,'Too many schedule records; narrow the API scope.');
 }while(next);
 if(inst==='shared')return {records:items.filter(r=>r.recordType==='holiday'||r.recordType==='special-event'),more:false,source:'Sadhana DynamoDB'};
 const rules=await listSeriesRules(inst);
 return {records:items.map(r=>projectSeriesRecord(r,rules)),more:false,source:'Sadhana DynamoDB'};
}
export async function getScheduleRecord(inst:ScheduleInstitution,id:string) {
 if(!/^[-a-zA-Z0-9]{4,90}$/.test(id))throw httpError(400,'Invalid schedule ID.');
 const value=await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)}}));
 return value.Item?toPublic(value.Item):null;
}
export async function changeSchedule(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims){
 canAccess(claims,inst,true);
 const current=await getScheduleRecord(inst,id);
 if(!current)throw httpError(404,'Schedule entry not found.');
 if(input.expectedVersion!==current.version)throw httpError(409,'This event has changed. Refresh it before editing.');
 const updated=scheduleChanges(current,input);
 // One-off teacher selection stores both the readable name and a verified
 // registry identity. Master baseline links use the separate audited endpoint.
 if(Object.prototype.hasOwnProperty.call(input,'teacherId')){
  if(current.recordType!=='class-session')throw httpError(400,'Teacher identity for a master class must be linked separately.');
  if(typeof input.teacher!=='string'||!input.teacher.trim())throw httpError(400,'Choose a teacher name with its registered identity.');
  const id=input.teacherId;
  if(typeof id!=='string'||!id)throw httpError(400,'Choose a registered teacher.');
  const match=await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${id}`},ConsistentRead:true}));
  const teacher=match.Item;
  if(!teacher||!teacher.active||!teacher.institutions?.includes(inst)||!matchesTeacherName(input.teacher,teacher as {displayName:string;aliases:string[]}))
   throw httpError(400,'Selected teacher must be active, belong to this institution and match the teacher name.');
 }
 const altered=Object.keys(input).filter(k=>k!=='expectedVersion' && (current as any)[k]!== (updated as any)[k]);
 const sessionOverrideFields=current.recordType==='class-session'
  ? [...new Set([...(current.sessionOverrideFields||[]),...altered])]:current.sessionOverrideFields;
 const next={...updated,...(sessionOverrideFields?{sessionOverrideFields}:{}),version:(current.version||1)+1,updatedAt:new Date().toISOString()};
 // Renaming a master class must not leave ordinary linked sessions under its old
 // name. Only sessions whose name equals the previous master name AND have no
 // explicit per-session name override participate in the atomic rename.
 if(current.recordType==='class' && altered.includes('name')){
  if(inst==='shared')throw httpError(400,'Shared calendar does not support master classes.');
  const linked:ScheduleRecord[]=[];
  let last:Record<string,unknown>|undefined;
  do{
   const result=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',
    ExpressionAttributeValues:{':pk':schedulePK(inst)},ConsistentRead:true,
    ExclusiveStartKey:last,Limit:250}));
   for(const row of result.Items||[]){
    const item=toPublic(row);
    if(item.recordType==='class-session'&&item.classId===id&&item.name===current.name&&
      !(item.sessionOverrideFields||[]).includes('name'))linked.push(item);
   }
   last=result.LastEvaluatedKey;
  }while(last);
  if(linked.length>79)throw httpError(413,
   `This class has ${linked.length} sessions needing renaming. The atomic limit is 79; no records changed. Contact the administrator to plan a batch-safe rename.`);
  const now=next.updatedAt;
  try{
   await db.send(new TransactWriteCommand({TransactItems:[
    {Put:{TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(id),entityType:'schedule',...next},
      ConditionExpression:'#v=:old',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':old':current.version}}},
    ...linked.map(r=>({Update:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(r.id)},
      UpdateExpression:'SET #name=:newName,#v=:newVersion,#updated=:now',
      ConditionExpression:'#v=:oldVersion AND #name=:oldName AND #classId=:classId',
      ExpressionAttributeNames:{'#name':'name','#v':'version','#updated':'updatedAt','#classId':'classId'},
      ExpressionAttributeValues:{':newName':next.name,':newVersion':(r.version||1)+1,':now':now,
       ':oldVersion':r.version,':oldName':current.name,':classId':id}}}))
   ]}));
  }catch(e){
   if((e as Error).name==='TransactionCanceledException'||(e as Error).name==='ConditionalCheckFailedException')
    throw httpError(409,'A linked session changed during rename. Refresh the calendar and try again. No partial rename was saved.');
   throw e;
  }
  return {record:next,renamedSessions:linked.length};
 }

 // Renaming a master class must not leave ordinary linked sessions under its old
 // name. Only sessions whose name equals the previous master name AND have no
 // explicit per-session name override participate in the atomic rename.
 if(current.recordType==='class' && altered.includes('name')){
  if(inst==='shared')throw httpError(400,'Shared calendar does not support master classes.');
  const linked:ScheduleRecord[]=[];
  let last:Record<string,unknown>|undefined;
  do{
   const result=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',
    ExpressionAttributeValues:{':pk':schedulePK(inst)},ConsistentRead:true,
    ExclusiveStartKey:last,Limit:250}));
   for(const row of result.Items||[]){
    const item=toPublic(row);
    if(item.recordType==='class-session'&&item.classId===id&&item.name===current.name&&
      !(item.sessionOverrideFields||[]).includes('name'))linked.push(item);
   }
   last=result.LastEvaluatedKey;
  }while(last);
  if(linked.length>79)throw httpError(413,
   `This class has ${linked.length} sessions needing renaming. The atomic limit is 79; no records changed. Contact the administrator to plan a batch-safe rename.`);
  const now=next.updatedAt;
  try{
   await db.send(new TransactWriteCommand({TransactItems:[
    {Put:{TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(id),entityType:'schedule',...next},
      ConditionExpression:'#v=:old',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':old':current.version}}},
    ...linked.map(r=>({Update:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(r.id)},
      UpdateExpression:'SET #name=:newName,#v=:newVersion,#updated=:now',
      ConditionExpression:'#v=:oldVersion AND #name=:oldName AND #classId=:classId',
      ExpressionAttributeNames:{'#name':'name','#v':'version','#updated':'updatedAt','#classId':'classId'},
      ExpressionAttributeValues:{':newName':next.name,':newVersion':(r.version||1)+1,':now':now,
       ':oldVersion':r.version,':oldName':current.name,':classId':id}}}))
   ]}));
  }catch(e){
   if((e as Error).name==='TransactionCanceledException'||(e as Error).name==='ConditionalCheckFailedException')
    throw httpError(409,'A linked session changed during rename. Refresh the calendar and try again. No partial rename was saved.');
   throw e;
  }
  return {record:next,renamedSessions:linked.length};
 }

 // Directly changing the teacher name invalidates any previous identity link.
 // Never permit a stale teacherId to imply permissions for the wrong teacher.
 if(altered.includes('teacher')&&!Object.prototype.hasOwnProperty.call(input,'teacherId'))delete next.teacherId;
 try{
  await db.send(new PutCommand({TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(id),entityType:'schedule',...next},ConditionExpression:'#v = :version',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':version':current.version}}));
 }catch(e){if((e as Error).name==='ConditionalCheckFailedException')throw httpError(409,'This event has changed. Refresh it before editing.');throw e;}
 return {record:next};
}
/** Pause/resume/archive a master without rewriting or removing its dated sessions. */
export async function changeMasterLifecycle(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims){
 if(inst==='shared')throw httpError(400,'Choose an academy.');
 demandInstitution(claims,inst);
 if(!input||!['active','paused','archived'].includes(String(input.lifecycleStatus)))throw httpError(400,'Choose Active, Paused or Archived.');
 const current=await getScheduleRecord(inst,id);
 if(!current||current.recordType!=='class')throw httpError(404,'Master class not found.');
 if(!Number.isInteger(input.expectedVersion)||current.version!==input.expectedVersion)throw httpError(409,'Class changed. Refresh and try again.');
 const lifecycleStatus=input.lifecycleStatus as 'active'|'paused'|'archived';
 if(((current as ScheduleRecord & {lifecycleStatus?:string}).lifecycleStatus||'active')===lifecycleStatus)return {record:current};
 const now=new Date().toISOString();
 try{
  const result=await db.send(new UpdateCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},
   UpdateExpression:'SET #state=:state,#version=:next,#updated=:now,#lifecycleBy=:actor',
   ConditionExpression:'#version=:expected AND #kind=:class',
   ExpressionAttributeNames:{'#state':'lifecycleStatus','#version':'version','#updated':'updatedAt','#lifecycleBy':'lifecycleUpdatedBy','#kind':'recordType'},
   ExpressionAttributeValues:{':state':lifecycleStatus,':next':current.version+1,':now':now,':actor':String(claims.sub),':expected':current.version,':class':'class'},
   ReturnValues:'ALL_NEW'}));
  return {record:toPublic(result.Attributes||{})};
 }catch(error){if((error as Error).name==='ConditionalCheckFailedException')throw httpError(409,'Class changed. Refresh and try again.');throw error;}
}

export async function createSchedule(inst:ScheduleInstitution,body:Record<string,unknown>,claims:Claims){
 canAccess(claims,inst,true);
 if(!body||typeof body!=='object'||Array.isArray(body))throw httpError(400,'Expected an event object.');
 const accepted=new Set(['recordType','name','programme','teacher','mode','location','date','endDate','startTime','endTime','allDay','status','classId','affectsClasses']);
 const illegal=Object.keys(body).filter(k=>!accepted.has(k));
 if(illegal.length)throw httpError(400,`Unexpected fields: ${illegal.join(', ')}`);
 const now=new Date().toISOString();
 const record=validateScheduleRecord({...body,id:`EVT-${randomUUID()}`,institution:inst,timezone:'Europe/London',version:1,createdAt:now,updatedAt:now} as ScheduleRecord);
 if(record.recordType==='class-session'){
  const master=await getScheduleRecord(inst,record.classId!);
  if(master?.recordType!=='class')throw httpError(400,'The session must belong to a master class in the same institution.');
 }
 try{
  await db.send(new PutCommand({TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(record.id),entityType:'schedule',...record},ConditionExpression:'attribute_not_exists(PK)'}));
 }catch(e){if((e as Error).name==='ConditionalCheckFailedException')throw httpError(409,'This event already exists.');throw e;}
 return {record};
}

/** Hard-delete one dated session only, never a master or a recurring rule. Admins only. */
export async function deleteScheduleSession(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims){
 if(inst==='shared')throw httpError(400,'Only academy sessions may be removed here.');
 demandInstitution(claims,inst);
 if(!input||!Number.isInteger(input.expectedVersion))throw httpError(400,'Expected session version is required.');
 const current=await getScheduleRecord(inst,id);
 if(!current)throw httpError(404,'Session not found.');
 if(current.recordType!=='class-session'&&current.recordType!=='special-event')throw httpError(400,'Master classes, holidays and recurring rules cannot be deleted here.');
 if((current as any).managedEvent||(current as any).sharedEventId)throw httpError(400,'Managed events must use the event management workflow.');
 if(current.version!==input.expectedVersion)throw httpError(409,'This session has changed. Refresh before deleting.');
 try{
  await db.send(new DeleteCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConditionExpression:'#ver=:expected AND #type=:type',ExpressionAttributeNames:{'#ver':'version','#type':'recordType'},ExpressionAttributeValues:{':expected':current.version,':type':current.recordType}}));
 }catch(e){if((e as Error).name==='ConditionalCheckFailedException')throw httpError(409,'Session changed. Refresh before deleting.');throw e;}
 return {deleted:true,id};
}

/** Admin-only preview and atomic deletion of dated sessions in an inclusive range.
 * Never deletes the master, a recurring rule, or records for other classes. */
export async function deleteSeriesSessions(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims,preview:boolean){
 if(inst==='shared')throw httpError(400,'Choose one academy.');
 demandInstitution(claims,inst);
 const master=await getScheduleRecord(inst,id);
 if(!master||master.recordType!=='class')throw httpError(404,'Master class not found.');
 if(!Number.isInteger(input.expectedVersion)||input.expectedVersion!==master.version)throw httpError(409,'Master class changed. Refresh before proceeding.');
 const from=input.effectiveFrom,until=input.effectiveUntil;
 if(typeof from!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(from)||typeof until!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(until)||until<from)throw httpError(400,'Choose a valid start and end date.');
 const all=await listScheduleRaw(inst);
 const matches=all.filter(r=>r.recordType==='class-session'&&r.classId===id&&r.date>=from&&r.date<=until).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 if(!matches.length)throw httpError(400,'No stored dated sessions in that range.');
 if(matches.length>80)throw httpError(413,'More than 80 sessions match. Select a shorter date range.');
 const signature=matches.map(r=>`${r.id}:${r.version}`).join('|');
 if(preview)return {count:matches.length,from,until,dates:matches.map(r=>({date:r.date,name:r.name,id:r.id})),signature};
 if(input.confirm!==true||input.signature!==signature)throw httpError(409,'Preview is missing or out of date. Review the dates again.');
 try{
  await db.send(new TransactWriteCommand({TransactItems:[
   {ConditionCheck:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConditionExpression:'#v=:v AND #t=:t',ExpressionAttributeNames:{'#v':'version','#t':'recordType'},ExpressionAttributeValues:{':v':master.version,':t':'class'}}},
   ...matches.map(r=>({Delete:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(r.id)},ConditionExpression:'#v=:v AND #t=:t AND #class=:class',ExpressionAttributeNames:{'#v':'version','#t':'recordType','#class':'classId'},ExpressionAttributeValues:{':v':r.version,':t':'class-session',':class':id}}}))
  ]}));
 }catch(e){if((e as Error).name==='TransactionCanceledException')throw httpError(409,'One or more sessions changed. Refresh the timetable and preview again.');throw e;}
 return {deleted:true,count:matches.length};
}

/** Administrator-only complete class removal. PREVIEW FIRST; all records in one transaction.
 * Hard cap avoids partial removal and prevents orphaned series rules. */
export async function deleteMasterClass(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims,preview:boolean){
 if(inst==='shared')throw httpError(400,'Choose an academy.');
 demandInstitution(claims,inst);
 const master=await getScheduleRecord(inst,id);
 if(!master||master.recordType!=='class')throw httpError(404,'Master class not found.');
 // Protect student history: never hard-delete a master with linked enrolments.
 let cursor:Record<string,unknown>|undefined;
 do {
  const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`OPS#${inst}#ENROLMENT`},ExclusiveStartKey:cursor,Limit:200,ConsistentRead:true}));
  if((page.Items||[]).some((r:any)=>r.classId===id))throw httpError(409,'This master class has student enrolments. Archive it instead; enrolment history must be preserved.');
  cursor=page.LastEvaluatedKey;
 }while(cursor);
 if(input.expectedVersion!==master.version)throw httpError(409,'Master class changed. Refresh before proceeding.');
 const [all,rules]=await Promise.all([listScheduleRaw(inst),listSeriesRules(inst)]);
 const sessions=all.filter(r=>r.recordType==='class-session'&&r.classId===id).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const relatedRules=rules.filter(r=>r.classId===id);
 const total=1+sessions.length+relatedRules.length;
 // DynamoDB transactions support at most 100 actions, but reserve room and reject instead of partial deletion.
 if(total>80)throw httpError(413,`This class has ${sessions.length} sessions and ${relatedRules.length} recurring rules. Delete sessions in batches first; master-class deletion is limited to 80 total records.`);
 const signature=[`${master.id}:${master.version}`,...sessions.map(r=>`${r.id}:${r.version}`),...relatedRules.map(r=>`${r.effectiveFrom}:${r.updatedAt}`)].join('|');
 if(preview)return {classId:id,name:master.name,masterVersion:master.version,sessionCount:sessions.length,ruleCount:relatedRules.length,dates:sessions.map(r=>r.date),signature};
 if(input.confirm!==true||typeof input.signature!=='string'||input.signature!==signature)throw httpError(409,'Preview is missing or outdated. Review the class again.');
 const actions:any[]=[
  {Delete:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConditionExpression:'#v=:v AND #type=:type',ExpressionAttributeNames:{'#v':'version','#type':'recordType'},ExpressionAttributeValues:{':v':master.version,':type':'class'}}},
  ...sessions.map(r=>({Delete:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(r.id)},ConditionExpression:'#v=:v AND #class=:class',ExpressionAttributeNames:{'#v':'version','#class':'classId'},ExpressionAttributeValues:{':v':r.version,':class':id}}})),
  ...relatedRules.map(r=>({Delete:{TableName:table(),Key:{PK:seriesPK(inst),SK:seriesSK(id,r.effectiveFrom)},ConditionExpression:'#updatedAt=:updatedAt',ExpressionAttributeNames:{'#updatedAt':'updatedAt'},ExpressionAttributeValues:{':updatedAt':r.updatedAt}}}))
 ];
 try{await db.send(new TransactWriteCommand({TransactItems:actions}));}
 catch(e){if((e as Error).name==='TransactionCanceledException')throw httpError(409,'The class changed. Refresh and preview again.');throw e;}
 return {deleted:true,classId:id,sessionCount:sessions.length,ruleCount:relatedRules.length};
}

/** Preview series effects against stored sessions and active rules, without writing. */
export async function previewScheduleSeries(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims){
 if(inst==='shared')throw httpError(400,'Only academy classes have recurring series.');
 canAccess(claims,inst,true);
 const master=await getScheduleRecord(inst,id);
 if(!master||master.recordType!=='class')throw httpError(404,'Master class not found.');
 const parsed=parseSeriesChange(input,master);
 const candidate:SeriesRule={institution:inst,classId:id,effectiveFrom:parsed.effectiveFrom,...(parsed.effectiveUntil?{effectiveUntil:parsed.effectiveUntil}:{}),changes:parsed.changes,updatedAt:new Date().toISOString(),updatedBy:String(claims.sub)};
 const [rules,result]=await Promise.all([listSeriesRules(inst),listScheduleRaw(inst)]);
 validateSeriesCandidate(master,rules,candidate);
 return calculateSeriesImpact(result,rules,candidate);
}
async function listScheduleRaw(inst:ScheduleInstitution):Promise<ScheduleRecord[]>{
 const records:ScheduleRecord[]=[];let key:Record<string,unknown>|undefined;
 do {const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ExclusiveStartKey:key,Limit:250}));records.push(...(page.Items||[]).map(toPublic));key=page.LastEvaluatedKey;if(records.length>3000)throw httpError(413,'Too many schedule records.');} while(key);
 return records;
}

/** Create an effective-dated recurring class change. Existing dated sessions
 * are never rewritten; the series rules are applied on schedule reads.
 * Also covers future sessions imported later from the Google day marker.
 */
export async function changeScheduleSeries(inst:ScheduleInstitution,id:string,input:Record<string,unknown>,claims:Claims){
 if(inst==='shared')throw httpError(400,'Only academy classes have recurring series.');
 canAccess(claims,inst,true);
 const master=await getScheduleRecord(inst,id);
 if(!master||master.recordType!=='class')throw httpError(404,'Master class not found.');
 const {effectiveFrom,effectiveUntil,changes,expectedVersion}=parseSeriesChange(input,master);
 if(changes.teacherId){
  const identity=await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${changes.teacherId}`},ConsistentRead:true}));
  const teacher=identity.Item;
  if(!teacher||!teacher.active||!teacher.institutions?.includes(inst)||!matchesTeacherName(changes.teacher||'',teacher as {displayName:string;aliases:string[]}))
   throw httpError(400,'Selected teacher is not active or the name does not match its registered profile.');
 }
 const existing=await listSeriesRules(inst);
 const now=new Date().toISOString();
 const rule:SeriesRule={institution:inst,classId:id,effectiveFrom,...(effectiveUntil?{effectiveUntil}:{}),changes,updatedAt:now,updatedBy:String(claims.sub)};
 validateSeriesCandidate(master,existing,rule);
 const auditId=randomUUID();
 try{
  await db.send(new TransactWriteCommand({TransactItems:[
   {Update:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},
    UpdateExpression:'SET #version=:new, #updatedAt=:now',
    ConditionExpression:'#version=:old AND #type=:class',
    ExpressionAttributeNames:{'#version':'version','#updatedAt':'updatedAt','#type':'recordType'},
    ExpressionAttributeValues:{':new':expectedVersion+1,':old':expectedVersion,':now':now,':class':'class'}}},
   {Put:{TableName:table(),Item:{PK:seriesPK(inst),SK:seriesSK(id,effectiveFrom),entityType:'scheduleSeriesRule',...rule},
    ConditionExpression:'attribute_not_exists(PK)'}},
   {Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`SERIES-EDIT#${now}#${auditId}`,
    entityType:'audit',action:'changeClassSeries',classId:id,effectiveFrom,...(effectiveUntil?{effectiveUntil}:{}),changes,at:now,actor:claims.sub},
    ConditionExpression:'attribute_not_exists(PK)'}}
  ]}));
 }catch(e){
  if((e as Error).name==='TransactionCanceledException'||(e as Error).name==='ConditionalCheckFailedException')
   throw httpError(409,'Class version changed or a rule already exists for this date. Refresh and choose a new effective date.');
  throw e;
 }
 return {effectiveFrom,effectiveUntil,classId:id,changes,masterVersion:expectedVersion+1};
}
