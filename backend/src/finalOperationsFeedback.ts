/** Canonical operational feedback. Stored as a discriminated learning record in
 * the existing practice table, never mistaken for a practice submission.
 */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import type {InstitutionId} from './model.ts';

type Row=Record<string,any>;
type Client={send:(command:any)=>Promise<any>};
const validDate=(date:unknown):date is string=>typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
 !Number.isNaN(Date.parse(date+'T12:00:00Z')) && new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
const error=(status:number,message:string)=>Object.assign(new Error(message),{status});
export const operationalFeedbackRecord=(row:Row)=>row.recordType==='operational-feedback' && typeof row.practiceId==='string' && row.practiceId.startsWith('FEEDBACK-');
const project=(row:Row)=>({id:row.practiceId,institution:row.institutionId,studentId:row.studentId,
 classId:row.classId,date:row.date,note:row.note,version:row.version,
 createdAt:row.createdAt,updatedAt:row.updatedAt});
export function makeM10FinalOperationsFeedback(client:Client){
 async function list(inst:InstitutionId,allowedClasses?:ReadonlySet<string>){
  if(inst!=='sruti'&&inst!=='raaga')throw error(400,'Invalid academy');
  if(allowedClasses&&!allowedClasses.size)return {records:[]};
  const result:Row[]=[];let cursor:Record<string,unknown>|undefined;
  do{
   const page=await client.send(new ScanCommand({TableName:entityTable('practice'),ConsistentRead:true,Limit:200,ExclusiveStartKey:cursor}));
   for(const row of page.Items??[])if(operationalFeedbackRecord(row)&&row.institutionId===inst&&(!allowedClasses||allowedClasses.has(row.classId)))result.push(project(row));
   cursor=page.LastEvaluatedKey;
   if(result.length>5000)throw error(413,'Feedback list requires pagination');
  }while(cursor);
  return {records:result};
 }
 async function save(inst:InstitutionId,actor:string,data:Row,existingId?:string){
  if(inst!=='sruti'&&inst!=='raaga')throw error(400,'Invalid academy');
  if(!actor)throw error(401,'Authentication required');
  if(!data||typeof data!=='object'||Array.isArray(data))throw error(400,'Invalid feedback');
  const allowed=existingId?new Set(['note','expectedVersion','studentId','classId','date']):new Set(['studentId','classId','date','note']);
  if(Object.keys(data).some(k=>!allowed.has(k)))throw error(400,'Unsupported feedback field');
  if(typeof data.note!=='string'||!data.note.trim()||data.note.trim().length>1500)throw error(400,'Feedback note required (maximum 1500 characters)');
  if(existingId&&!/^FEEDBACK-[a-f\d-]{36}$/i.test(existingId))throw error(400,'Invalid feedback ID');
  if(!existingId&&(typeof data.studentId!=='string'||!data.studentId||typeof data.classId!=='string'||!data.classId||!validDate(data.date)))throw error(400,'Student, class and valid date required');
  const prior=existingId?(await client.send(new GetCommand({TableName:entityTable('practice'),Key:{practiceId:existingId},ConsistentRead:true}))).Item:null;
  if(existingId&&(!prior||!operationalFeedbackRecord(prior)||prior.institutionId!==inst))throw error(404,'Feedback not found');
  if(prior){
   if(!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion!==prior.version)throw error(409,'Feedback changed; refresh and retry');
   for(const field of ['studentId','classId','date'])if(data[field]!==undefined&&data[field]!==prior[field])throw error(400,'Feedback student, class and date cannot change');
  }
  const now=new Date().toISOString();const id=existingId??`FEEDBACK-${randomUUID()}`;
  const item={practiceId:id,recordType:'operational-feedback',institutionId:inst,
   studentId:prior?.studentId??data.studentId,classId:prior?.classId??data.classId,
   date:prior?.date??data.date,note:data.note.trim(),version:(prior?.version??0)+1,
   createdAt:prior?.createdAt??now,updatedAt:now,updatedBy:actor};
  const audit={auditId:`AUDIT-${randomUUID()}`,institutionId:inst,action:prior?'operationalFeedbackEdit':'operationalFeedbackCreate',actorCognitoSub:actor,
   timestamp:now,resourceType:'operational-feedback',resourceId:id};
  try{
   await client.send(new TransactWriteCommand({TransactItems:[
    {Put:{TableName:entityTable('practice'),Item:item,...(prior?{ConditionExpression:'#v=:prior AND institutionId=:inst AND recordType=:kind',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':prior':prior.version,':inst':inst,':kind':'operational-feedback'}}:{ConditionExpression:'attribute_not_exists(practiceId)'})}},
    {Put:{TableName:entityTable('audit'),Item:audit,ConditionExpression:'attribute_not_exists(auditId)'}}
   ]}));
  }catch(e:any){if(e.name==='TransactionCanceledException')throw error(409,'Feedback changed; refresh and retry');throw e;}
  return {record:project(item)};
 }
 async function get(inst:InstitutionId,id:string){
  if(!/^FEEDBACK-[a-f\d-]{36}$/i.test(id))return null;
  const item=(await client.send(new GetCommand({TableName:entityTable('practice'),Key:{practiceId:id},ConsistentRead:true}))).Item;
  return item&&operationalFeedbackRecord(item)&&item.institutionId===inst?project(item):null;
 }
 return {list,get,save};
}
let cached:ReturnType<typeof makeM10FinalOperationsFeedback>|undefined;
export function finalOperationsFeedback(){
 if(!cached)cached=makeM10FinalOperationsFeedback(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'})));
 return cached;
}
