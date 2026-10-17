import {makeRoutedClient} from './tableRouter.ts';
/** v0.7.7: identity links only. Never rewrite session teacher text or effective dates. */
import {randomUUID} from 'node:crypto';
import {matchesTeacherName,suggestedTeacherIds} from './teacherNameMatch.ts';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {demandInstitution,httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {listTeachers} from './teacherDirectory.ts';
import type {TeacherRecord} from './teacherDirectory.ts';
import {getScheduleRecord} from './scheduleStore.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
import {seriesPK,seriesSK} from './scheduleSeries.ts';

const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing Sadhana table name');return process.env.SADHANA_TABLE_NAME;};

async function queryAll(pk:string):Promise<Record<string,any>[]> {
 const items:Record<string,any>[]=[];let key:Record<string,unknown>|undefined;
 do{
  const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':pk},ExclusiveStartKey:key,ConsistentRead:true,Limit:250}));
  items.push(...(page.Items||[]));key=page.LastEvaluatedKey;
  if(items.length>3000)throw httpError(413,'Too many records for teacher linking.');
 }while(key);
 return items;
}
export async function listTeacherLinks(inst:InstitutionId,claims:Claims){
 demandInstitution(claims,inst);
 const [{records:teachers},records,rules]=await Promise.all([
  listTeachers(inst,claims),queryAll(schedulePK(inst)),queryAll(seriesPK(inst))
 ]);
 const masters=records.filter(x=>x.recordType==='class');
 const masterById=new Map(masters.map(x=>[x.id,x]));
 const choices=teachers.filter(t=>t.active&&t.institutions.includes(inst))
  .map(({id,displayName,subjects,photoUrl})=>({id,displayName,subjects,photoUrl}));
 const rows=[
  ...masters.map(x=>({classId:x.id,className:x.name,version:x.version,
   scope:'master' as const,effectiveFrom:'',teacher:x.teacher||'',teacherId:x.teacherId||'',
   suggestedIds:suggestedTeacherIds(x.teacher||'',teachers)})),
  ...rules.filter(x=>x.changes?.teacher&&masterById.has(x.classId)).map(x=>({
   classId:x.classId,className:masterById.get(x.classId).name,version:masterById.get(x.classId).version,
   scope:'series' as const,effectiveFrom:x.effectiveFrom,teacher:x.changes.teacher,
   teacherId:x.changes.teacherId||'',suggestedIds:suggestedTeacherIds(x.changes.teacher,teachers)
  }))
 ];
 return {institution:inst,teachers:choices,rows,more:false};
}
export async function linkTeacherIdentity(inst:InstitutionId,classId:string,body:Record<string,unknown>,claims:Claims){
 demandInstitution(claims,inst);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['teacherId','effectiveFrom','expectedVersion'].includes(k)))
  throw httpError(400,'Unexpected teacher-link fields.');
 if(typeof body.teacherId!=='string'||!/^TEACHER-[0-9a-f-]{36}$/i.test(body.teacherId))throw httpError(400,'Choose a registered teacher.');
 if(!Number.isInteger(body.expectedVersion))throw httpError(400,'Expected class version required.');
 const fromValue = body.effectiveFrom;
 if(fromValue !== undefined &&
    (typeof fromValue !== 'string' ||
     !/^\d{4}-\d{2}-\d{2}$/.test(fromValue)))
  throw httpError(400,'Invalid series effective date.');
 const from: string | undefined =
  typeof fromValue === 'string' ? fromValue : undefined;
 const master=await getScheduleRecord(inst,classId);
 if(!master||master.recordType!=='class')throw httpError(404,'Master class not found.');
 if(master.version!==body.expectedVersion)throw httpError(409,'Master class version changed. Refresh before linking.');
 const lookup=await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${body.teacherId}`},ConsistentRead:true}));
 const teacher=lookup.Item as TeacherRecord|undefined;
 if(!teacher||!teacher.active||!teacher.institutions?.includes(inst))throw httpError(400,'Teacher is not active in this institution.');
 const target=from===undefined?null:await db.send(new GetCommand({TableName:table(),Key:{PK:seriesPK(inst),SK:seriesSK(classId,from)},ConsistentRead:true}));
 if(from!==undefined&&(!target?.Item||target.Item.classId!==classId))throw httpError(404,'Effective-dated teacher rule not found.');
 const name=from===undefined?master.teacher:target!.Item!.changes?.teacher;
 if(!matchesTeacherName(name||'',teacher))throw httpError(409,'Teacher name does not match this class or series rule. Change the teaching assignment separately before linking its identity.');
 const linked=from===undefined?master.teacherId:target!.Item!.changes?.teacherId;
 if(linked)throw httpError(409,'This assignment is already linked. Refresh to see the current teacher.');
 const now=new Date().toISOString(),auditId=randomUUID();
 const version=master.version!;
 const transact:any[]=[
  {Update:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(classId)},
   UpdateExpression:from===undefined?'SET teacherId=:teacherId, #v=:next, updatedAt=:now':'SET #v=:next, updatedAt=:now',
   ConditionExpression:from===undefined?'#v=:old AND #teacher=:name AND attribute_not_exists(teacherId)':'#v=:old AND #type=:class',
   ExpressionAttributeNames:from===undefined?{'#v':'version','#teacher':'teacher'}:{'#v':'version','#type':'recordType'},
   ExpressionAttributeValues:from===undefined?{':old':version,':next':version+1,':teacherId':teacher.id,':name':name,':now':now}:{':old':version,':next':version+1,':class':'class',':now':now}}},
 ];
 if(from!==undefined)transact.push({Update:{TableName:table(),Key:{PK:seriesPK(inst),SK:seriesSK(classId,from)},
  UpdateExpression:'SET #changes.#teacherId=:teacherId, updatedAt=:now',
  ConditionExpression:'#changes.#teacher=:name AND attribute_not_exists(#changes.#teacherId)',
  ExpressionAttributeNames:{'#changes':'changes','#teacher':'teacher','#teacherId':'teacherId'},
  ExpressionAttributeValues:{':teacherId':teacher.id,':name':name,':now':now}}});
 transact.push({Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`TEACHER-LINK#${now}#${auditId}`,
  entityType:'audit',action:'linkRegisteredTeacher',classId,teacherId:teacher.id,teacherName:teacher.displayName,
  ...(from!==undefined?{effectiveFrom:from}:{}),actor:claims.sub,at:now},ConditionExpression:'attribute_not_exists(PK)'}});
 try{await db.send(new TransactWriteCommand({TransactItems:transact}));}
 catch(e){if((e as Error).name==='TransactionCanceledException'||(e as Error).name==='ConditionalCheckFailedException')throw httpError(409,'Class or teacher assignment changed. Refresh and review again.');throw e;}
 return {classId,teacherId:teacher.id,effectiveFrom:from??null,masterVersion:version+1,linked:true};
}
