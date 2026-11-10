import {entityTable} from './entityTables.mjs';
/** Effective-dated M9 series-rule preview/create. Does not rewrite dated occurrences. */
import {createHash, randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {demandInstitution,httpError} from './model.ts';
import type {Claims} from './model.ts';
import {parseSeriesChange,projectSeriesRecord,todayLondon,validateSeriesCandidate} from './scheduleSeries.ts';
import type {SeriesRule} from './scheduleSeries.ts';
import type {ScheduleRecord} from './scheduleModel.ts';

export type M95SeriesClient={send:(command:any)=>Promise<any>};
// Resolve lazily so a missing final-mode acknowledgement cannot fail Lambda cold start.
const TABLE={get classes(){return entityTable('classes')},get sessions(){return entityTable('sessions')},get people(){return entityTable('people')},get audit(){return entityTable('audit')}};
const MAX_SCAN=5000;
const idPattern=/^[-a-zA-Z0-9]{4,90}$/;
function enabled(){
 if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){
  if(process.env.SADHANA_FINAL_SERIES_WRITES!=='enabled'||process.env.SADHANA_ENTITY_FINAL_ACK!=='enabled'||process.env.SADHANA_DATA_MODE==='split')
   throw httpError(503,'Final series writes are disabled.');
  return;
 }
 if(process.env.M95_COMPAT_MODE!=='pilot'||process.env.M95_CALENDAR_WRITES!=='enabled'||process.env.M95_SERIES_WRITES!=='enabled')throw httpError(503,'M9 series edit pilot disabled.');
}
function ruleId(institution:string,classId:string,from:string){
 return 'm95series_'+createHash('sha256').update(JSON.stringify([institution,classId,from])).digest('hex').slice(0,32);
}
async function scanAll(client:M95SeriesClient,table:string){
 const items:Record<string,any>[]=[];let cursor:Record<string,any>|undefined;
 do {
  const page=await client.send(new ScanCommand({TableName:table,ConsistentRead:true,ExclusiveStartKey:cursor,Limit:250}));
  items.push(...(page.Items??[]));cursor=page.LastEvaluatedKey;
  if(items.length>MAX_SCAN)throw httpError(413,'Too many calendar records for series validation.');
 }while(cursor);
 return items;
}
function asRule(item:Record<string,any>):SeriesRule|undefined{
 if(item.recordType!=='series-change')return;
 const x=item.legacyPayload??item;
 if(!['raaga','sruti'].includes(item.institutionId)||typeof item.classId!=='string'||typeof x.effectiveFrom!=='string')return;
 return {institution:item.institutionId,classId:item.classId,effectiveFrom:x.effectiveFrom,
   ...(x.effectiveUntil?{effectiveUntil:x.effectiveUntil}:{}),changes:x.changes??{},
   updatedAt:x.updatedAt??item.updatedAt,updatedBy:x.updatedBy??item.updatedBy??''};
}
export function makeM95SeriesWriter(client:M95SeriesClient){
 async function prepare(inst:'raaga'|'sruti',classId:string,raw:Record<string,unknown>,claims:Claims){
  enabled();demandInstitution(claims,inst);
  if(!idPattern.test(classId))throw httpError(400,'Invalid class ID.');
  const record=(await client.send(new GetCommand({TableName:TABLE.classes,Key:{classId},ConsistentRead:true}))).Item;
  if(!record||record.institutionId!==inst||record.legacyPayload?.recordType!=='class')throw httpError(404,'Master class not found.');
  const master=record.legacyPayload as ScheduleRecord;
  const parsed=parseSeriesChange(raw,{...master,version:record.version},todayLondon());
  const rows=await scanAll(client,TABLE.sessions);
  const existingItems=rows.filter(item=>{
   const rule=asRule(item);return !!rule&&rule.institution===inst&&rule.classId===classId;
  });
  const sameDateItems=existingItems.filter(item=>asRule(item)?.effectiveFrom===parsed.effectiveFrom);
  if(sameDateItems.length>1)throw httpError(409,'Multiple rules already exist for this date. Ask an administrator to review the timetable data.');
  const replacedRule=sameDateItems[0];
  const existing=existingItems.map(asRule).filter((r):r is SeriesRule=>!!r&&r.effectiveFrom!==parsed.effectiveFrom);
  if(parsed.changes.teacherId){
   const teacher=(await client.send(new GetCommand({TableName:TABLE.people,Key:{personId:parsed.changes.teacherId},ConsistentRead:true}))).Item;
   if(!teacher||teacher.status!=='active'||!teacher.institutionIds?.includes(inst)||!teacher.personTypes?.includes('teacher'))throw httpError(400,'Teacher is not active in this academy.');
   const expected=(parsed.changes.teacher??'').trim().toLocaleLowerCase();
   const names=[teacher.displayName,...(teacher.staffProfile?.aliases??[])].map((x:string)=>String(x).trim().toLocaleLowerCase());
   if(!names.includes(expected))throw httpError(400,'Teacher name does not match the selected identity.');
  }
  const now=new Date().toISOString();
  const rule:SeriesRule={institution:inst,classId,effectiveFrom:parsed.effectiveFrom,
   ...(parsed.effectiveUntil?{effectiveUntil:parsed.effectiveUntil}:{}),changes:parsed.changes,updatedAt:now,updatedBy:String(claims.sub)};
  validateSeriesCandidate({...master,version:record.version},existing,rule);
  const affected=rows.filter(item=>item.recordType==='class-session'&&item.classId===classId&&item.institutionId===inst)
    .map(item=>item.legacyPayload as ScheduleRecord).filter(x=>!!x?.date&&x.date>=rule.effectiveFrom&&(!rule.effectiveUntil||x.date<=rule.effectiveUntil));
  // Verify every affected occurrence against the projected series rule.
  for(const session of affected)projectSeriesRecord(session,[...existing,rule],session.date);
  return {record,parsed,rule,replacedRule,previousChanges:replacedRule?(asRule(replacedRule)?.changes??{}):undefined,affectedCount:affected.length,now};
 }
 return {
  async preview(inst:'raaga'|'sruti',classId:string,raw:Record<string,unknown>,claims:Claims){
   const x=await prepare(inst,classId,raw,claims);
   return {classId,effectiveFrom:x.rule.effectiveFrom,effectiveUntil:x.rule.effectiveUntil,changes:x.rule.changes,
    masterVersion:x.record.version,affectedSessionCount:x.affectedCount,readOnly:true};
  },
  async change(inst:'raaga'|'sruti',classId:string,raw:Record<string,unknown>,claims:Claims){
   const x=await prepare(inst,classId,raw,claims);
   const item={sessionId:x.replacedRule?.sessionId??ruleId(inst,classId,x.rule.effectiveFrom),recordType:'series-change',institutionId:inst,
    classId,seriesId:classId,effectiveFrom:x.rule.effectiveFrom,
    ...(x.rule.effectiveUntil?{effectiveUntil:x.rule.effectiveUntil}:{}),changes:x.rule.changes,
    updatedAt:x.now,updatedBy:String(claims.sub),
    legacyPayload:{PK:`SCHEDULE_SERIES#${inst}`,SK:`CLASS#${classId}#FROM#${x.rule.effectiveFrom}`,entityType:'scheduleSeriesRule',...x.rule}};
   const audit={auditId:`m95_${randomUUID()}`,institutionId:inst,action:x.replacedRule?'replaceClassSeriesRule':'changeClassSeries',actorCognitoSub:String(claims.sub),
    timestamp:x.now,resourceType:'class',resourceId:classId,effectiveFrom:x.rule.effectiveFrom,changes:x.rule.changes,
    ...(x.previousChanges?{previousChanges:x.previousChanges}:{}),schemaVersion:1};
   const ruleWrite=x.replacedRule?(()=>{
    const old=x.replacedRule as Record<string,any>,names:Record<string,string>={'#type':'recordType','#class':'classId','#inst':'institutionId'};
    const values:Record<string,unknown>={':type':'series-change',':class':classId,':inst':inst};
    const conditions=['#type=:type','#class=:class','#inst=:inst'];
    if(old.effectiveFrom!==undefined){names['#from']='effectiveFrom';conditions.push('#from=:from');}
    else{names['#legacy']='legacyPayload';names['#from']='effectiveFrom';conditions.push('#legacy.#from=:from');}
    values[':from']=x.rule.effectiveFrom;
    if(old.updatedAt!==undefined){names['#updated']='updatedAt';conditions.push('#updated=:oldUpdated');values[':oldUpdated']=old.updatedAt;}
    else if(old.legacyPayload?.updatedAt!==undefined){names['#legacy']='legacyPayload';names['#updated']='updatedAt';conditions.push('#legacy.#updated=:oldUpdated');values[':oldUpdated']=old.legacyPayload.updatedAt;}
    else if(old.changes!==undefined){names['#changes']='changes';conditions.push('#changes=:oldChanges');values[':oldChanges']=old.changes;}
    else if(old.legacyPayload?.changes!==undefined){names['#legacy']='legacyPayload';names['#changes']='changes';conditions.push('#legacy.#changes=:oldChanges');values[':oldChanges']=old.legacyPayload.changes;}
    else throw httpError(409,'The existing rule has no safe revision marker. Refresh and ask an administrator to review it.');
    return {Put:{TableName:TABLE.sessions,Item:item,ConditionExpression:conditions.join(' AND '),ExpressionAttributeNames:names,ExpressionAttributeValues:values}};
   })():{Put:{TableName:TABLE.sessions,Item:item,ConditionExpression:'attribute_not_exists(sessionId)'}};
   try{
    await client.send(new TransactWriteCommand({TransactItems:[
     {Update:{TableName:TABLE.classes,Key:{classId},UpdateExpression:'SET #v=:new,#updated=:now,#legacy.#v=:new',
      ConditionExpression:'#v=:old AND #inst=:inst',
      ExpressionAttributeNames:{'#v':'version','#updated':'updatedAt','#legacy':'legacyPayload','#inst':'institutionId'},
      ExpressionAttributeValues:{':old':x.record.version,':new':x.record.version+1,':now':x.now,':inst':inst}}},
     ruleWrite,
     {Put:{TableName:TABLE.audit,Item:audit,ConditionExpression:'attribute_not_exists(auditId)'}}
    ]}));
   }catch(err){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes((err as Error).name))throw httpError(409,'The class or recurring rules have changed. Refresh and retry.');throw err;}
   return {classId,effectiveFrom:x.rule.effectiveFrom,effectiveUntil:x.rule.effectiveUntil,changes:x.rule.changes,masterVersion:x.record.version+1};
  }
 };
}
export function defaultM95SeriesWriter(){return makeM95SeriesWriter(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));}
