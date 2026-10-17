/** Explicit account-to-student links. No name, email or family-ID inference authorises access. */
import {GetCommand,QueryCommand,PutCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {demandInstitution,httpError} from './model.ts';
import {isStudentRecordId,isAccountSubject,canReadStudent} from './accessRules.ts';
import {randomUUID} from 'node:crypto';
import type {Claims,InstitutionId} from './model.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
const validInst=(v:string):InstitutionId=>{if(v!=='raaga'&&v!=='sruti')throw httpError(400,'Choose an academy');return v};
const validSub=isAccountSubject;
const validStudent=isStudentRecordId;
const key=(inst:InstitutionId,sub:string,studentId:string)=>({PK:`ACCESS#${inst}#${sub}`,SK:`STUDENT#${studentId}`});
const publicLink=(x:any)=>({studentId:x.studentId,institution:x.institution,kind:x.kind,status:x.status,version:x.version,updatedAt:x.updatedAt});
export async function myStudentLinks(instRaw:string,claims:Claims){
 const inst=validInst(instRaw);if(!claims.sub)throw httpError(401,'Sign in required');
 let last:any;const result:any[]=[];
 do{const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`ACCESS#${inst}#${claims.sub}`},ExclusiveStartKey:last,Limit:100,ConsistentRead:true}));result.push(...(page.Items||[]));last=page.LastEvaluatedKey;if(result.length>100)throw httpError(413,'Too many linked students')}while(last);
 return {records:result.filter(r=>canReadStudent(r,r.studentId,inst)).map(publicLink)};
}
export async function requestStudentAccess(instRaw:string,claims:Claims,body:any){
 const inst=validInst(instRaw);if(!validSub(claims.sub))throw httpError(401,'Verified account required');
 if(!body||Object.keys(body).some(k=>!['studentId','kind'].includes(k))||!validStudent(body.studentId)||!['student','guardian'].includes(body.kind))throw httpError(400,'Provide student record ID and student/guardian access type');
 const now=new Date().toISOString(),k=key(inst,claims.sub!,body.studentId);
 // Does not reveal whether a claimed student ID exists, and grants zero permissions.
 try{await db.send(new PutCommand({TableName:table(),Item:{...k,institution:inst,studentId:body.studentId,subject:claims.sub,kind:body.kind,status:'pending',version:1,createdAt:now,updatedAt:now,GSI1PK:`ACCESS_REQUEST#${inst}`,GSI1SK:`${now}#${claims.sub}#${body.studentId}`},ConditionExpression:'attribute_not_exists(PK)'}))}catch(e:any){if(e.name!=='ConditionalCheckFailedException')throw e;throw httpError(409,'Request already recorded. Contact the academy if changes are needed.')}
 return {submitted:true,status:'pending'};
}
export async function listAccessRequests(instRaw:string,claims:Claims){
 const inst=validInst(instRaw);demandInstitution(claims,inst);
 // A dedicated institution partition is required for safe paginated admin queues.
 let last:any;const records:any[]=[];
 do{const result=await db.send(new QueryCommand({TableName:table(),IndexName:'GSI1',KeyConditionExpression:'GSI1PK=:pk',ExpressionAttributeValues:{':pk':`ACCESS_REQUEST#${inst}`},ExclusiveStartKey:last,Limit:100}));records.push(...(result.Items||[]));last=result.LastEvaluatedKey;if(records.length>2000)throw httpError(413,'Use a narrower access queue')}while(last);
 return {records:records.map(r=>({...publicLink(r),subject:r.subject}))};
}
export async function decideStudentAccess(instRaw:string,claims:Claims,body:any){
 const inst=validInst(instRaw);demandInstitution(claims,inst);
 if(!body||Object.keys(body).some(k=>!['subject','studentId','decision','expectedVersion'].includes(k))||!validSub(body.subject)||!validStudent(body.studentId)||!['approved','revoked','rejected'].includes(body.decision)||!Number.isInteger(body.expectedVersion))throw httpError(400,'Invalid access decision');
 // Confirm the existing global student identity before any approval.
 if(body.decision==='approved'){
  const student=await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${body.studentId}`},ConsistentRead:true}));
  if(!student.Item||student.Item.archived)throw httpError(404,'Active student record not found');
  // Only students with a matching academy enrolment qualify for academy access.
  let last:any,found=false;
  do{const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`OPS#${inst}#ENROLMENT`},ExclusiveStartKey:last,Limit:100,ConsistentRead:true}));found ||= (page.Items||[]).some((e:any)=>e.studentId===body.studentId&&!e.archived);last=page.LastEvaluatedKey;}while(last&&!found);
  if(!found)throw httpError(409,'Student has no active enrolment in this academy');
 }
 if(body.decision==='approved' && body.subject===claims.sub){
  const allow=(process.env.SADHANA_SUPER_ADMIN_SUBJECTS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!claims.sub||!allow.includes(claims.sub))throw httpError(403,'Only a designated Super Admin may approve their own access request');
 }
 const now=new Date().toISOString();
 try{await db.send(new TransactWriteCommand({TransactItems:[{Update:{TableName:table(),Key:key(inst,body.subject,body.studentId),UpdateExpression:'SET #s=:status, #v=:next, updatedAt=:now, reviewedBy=:actor',ConditionExpression:'#v=:expected AND attribute_exists(PK)',ExpressionAttributeNames:{'#s':'status','#v':'version'},ExpressionAttributeValues:{':status':body.decision,':next':body.expectedVersion+1,':now':now,':actor':claims.sub,':expected':body.expectedVersion}}},{Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`ACCESS#${now}#${randomUUID()}`,entityType:'audit',action:'studentAccessDecision',subject:body.subject,studentId:body.studentId,decision:body.decision,actor:claims.sub,selfApproved:body.subject===claims.sub,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}))}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Request changed. Refresh before deciding.');throw e}
 return {updated:true,status:body.decision};
}
export async function myStudentOverview(instRaw:string,claims:Claims){
 const inst=validInst(instRaw);const links=(await myStudentLinks(inst,claims)).records;
 const records=[] as any[];
 for(const link of links){
  const student=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${link.studentId}`},ConsistentRead:true}))).Item;
  if(!student||student.archived)continue;
  // Minimal student fields only; practice and timetable are added through individually scoped APIs.
  records.push({id:student.id,name:student.name,rollNumber:student.rollNumber||'',kind:link.kind});
 }
 return {records};
}
