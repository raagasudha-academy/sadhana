/** Canonical-only teacher profile updates. Account linking and academy removal remain separately reviewed. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {httpError,clean,demandInstitution} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';

type Client={send:(command:any)=>Promise<any>};
const validId=(s:string)=>/^TEACHER-[0-9a-f-]{36}$/i.test(s);
export function makeFinalTeacherPatch(db:Client) {
 return async function patchTeacher(inst:InstitutionId,claims:Claims,id:string,body:any) {
  demandInstitution(claims,inst);
  if(!validId(id))throw httpError(400,'Invalid teacher ID.');
  if(!body||typeof body!=='object'||Array.isArray(body))throw httpError(400,'Invalid teacher body.');
  const fields=['displayName','institutions','subjects','aliases','cognitoSub','active','expectedVersion'];
  if(Object.keys(body).some(k=>!fields.includes(k)))throw httpError(400,'Unsupported teacher field.');
  if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1)throw httpError(400,'Expected version required.');
  const results:any[]=[];let cursor:any;
  do {
   const r=await db.send(new ScanCommand({TableName:entityTable('people'),ConsistentRead:true,ExclusiveStartKey:cursor,Limit:100}));
   results.push(...(r.Items||[]).filter((p:any)=>p.legacyPayload?.id===id&&p.personTypes?.includes('teacher')));
   cursor=r.LastEvaluatedKey;
   if(results.length>1)throw httpError(409,'Duplicate teacher profiles require review.');
  } while(cursor);
  const person=results[0];
  if(!person)throw httpError(404,'Teacher not found in canonical people.');
  const old=person.legacyPayload;
  if(!Number.isSafeInteger(person.version)||person.version<1||!Number.isSafeInteger(old.version)||old.version!==body.expectedVersion)
   throw httpError(409,'Teacher profile changed; refresh and retry.');
  const insts=Array.isArray(body.institutions)?body.institutions:[];
  if(!insts.length||insts.some((x:any)=>x!=='raaga'&&x!=='sruti')||new Set(insts).size!==insts.length)
   throw httpError(400,'Invalid teacher institutions.');
  if(!Array.isArray(old.institutions)||old.institutions.some((academy:string)=>!insts.includes(academy)))
   throw httpError(409,'Removing academy membership requires dedicated review.');
  if(!old.institutions.includes(inst)||!person.institutionIds?.includes(inst))throw httpError(403,'Teacher does not belong to this academy.');
  // Adding a teacher to another academy requires an administrator in every
  // academy whose staff directory and teaching permissions will change.
  for(const academy of insts)demandInstitution(claims,academy);
  if(typeof body.cognitoSub!=='string'||body.cognitoSub!==String(old.cognitoSub||''))
   throw httpError(409,'Teacher account-link changes require dedicated verification.');
  if(typeof body.displayName!=='string'||!clean(body.displayName)||clean(body.displayName).length>100)
   throw httpError(400,'Invalid teacher name.');
  const strings=(value:any,max:number,limit:number)=>{
   if(!Array.isArray(value)||value.length>max||value.some((x:any)=>typeof x!=='string'))throw httpError(400,'Invalid teacher list.');
   const v=[...new Set(value.map((x:string)=>clean(x)))];
   if(v.some(x=>!x||x.length>limit))throw httpError(400,'Invalid teacher list item.');
   return v;
  };
  const subjects=strings(body.subjects,10,60),aliases=strings(body.aliases,12,100);
  if(!subjects.length||typeof body.active!=='boolean')throw httpError(400,'Subject and active status required.');
  if(body.active!==old.active)throw httpError(409,'Teacher activation changes require dedicated review.');
  const now=new Date().toISOString();
  const added=insts.filter((academy:InstitutionId)=>!old.institutions.includes(academy));
  const changed={...old,displayName:clean(body.displayName),institutions:insts,subjects,aliases,active:body.active,version:old.version+1,updatedAt:now};
  const next={...person,displayName:changed.displayName,institutionIds:insts,legacyPayload:changed,version:person.version+1,updatedAt:now};
  const auditRows=insts.map((academy:InstitutionId)=>({
   Put:{TableName:entityTable('audit'),Item:{auditId:`AUDIT-${randomUUID()}`,institutionId:academy,action:added.includes(academy)?'TEACHER_ACADEMY_MEMBERSHIP_ADDED':'TEACHER_PROFILE_UPDATED',resourceType:'teacher',resourceId:id,actorCognitoSub:claims.sub,timestamp:now},ConditionExpression:'attribute_not_exists(auditId)'}
  }));
  try{
   await db.send(new TransactWriteCommand({TransactItems:[
    {Put:{TableName:entityTable('people'),Item:next,ConditionExpression:'#v=:v AND contains(institutionIds,:inst) AND contains(personTypes,:teacher)',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':person.version,':inst':inst,':teacher':'teacher'}}},
    ...auditRows
   ]}));
  }catch(e:any){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))throw httpError(409,'Teacher changed. Refresh and retry.');throw e;}
  return {...changed,cognitoSub:old.cognitoSub||''};
 };
}
let singleton:ReturnType<typeof makeFinalTeacherPatch>|undefined;
export function finalTeacherPatch(){
 if(!singleton)singleton=makeFinalTeacherPatch(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));
 return singleton;
}
