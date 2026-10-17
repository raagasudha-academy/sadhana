/** Teacher comments on student-submitted practice. No student-record mutation. */
import {randomUUID} from 'node:crypto';
import {GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
const instOK=(i:string):InstitutionId=>{if(i!=='sruti'&&i!=='raaga')throw httpError(400,'Invalid institution');return i};
const practiceKey=(inst:InstitutionId,id:string)=>({PK:`OPS#${inst}#PRACTICE`,SK:`ITEM#${id}`});
export function validateTeacherComment(body:unknown):string{
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='comment'))throw httpError(400,'Unexpected comment fields');
 const comment=(body as {comment?:unknown}).comment;
 if(typeof comment!=='string'||comment.trim().length<1||comment.trim().length>1000)throw httpError(400,'Comment must be 1–1000 characters');
 return comment.trim();
}
async function assigned(inst:InstitutionId,claims:Claims,classId:string){
 if(!claims.sub)throw httpError(401,'Sign in required');
 const m=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(classId)},ConsistentRead:true}))).Item;
 if(!m||m.recordType!=='class'||!m.teacherId)throw httpError(403,'Verified teaching assignment required');
 const t=(await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${m.teacherId}`},ConsistentRead:true}))).Item;
 if(!t?.active||t.cognitoSub!==claims.sub||!t.institutions?.includes(inst))throw httpError(403,'Not assigned to this class');
 return t;
}
export async function teacherPracticeComments(instRaw:string,claims:Claims,practiceId:string){
 const inst=instOK(instRaw);
 if(!/^PRACTICE-[0-9a-f-]{36}$/i.test(practiceId))throw httpError(400,'Invalid practice ID');
 const practice=(await db.send(new GetCommand({TableName:table(),Key:practiceKey(inst,practiceId),ConsistentRead:true}))).Item;
 if(!practice||practice.institution!==inst)throw httpError(404,'Practice entry not found');
 await assigned(inst,claims,practice.classId);
 return practice;
}
export async function commentOnPractice(instRaw:string,claims:Claims,practiceId:string,body:unknown){
 const comment=validateTeacherComment(body);
 const practice=await teacherPracticeComments(instRaw,claims,practiceId);
 const inst=instOK(instRaw),now=new Date().toISOString(),id=`COMMENT-${randomUUID()}`;
 const item={PK:`PRACTICE_COMMENTS#${inst}#${practiceId}`,SK:`COMMENT#${now}#${id}`,id,practiceId,studentId:practice.studentId,classId:practice.classId,comment,actor:claims.sub,createdAt:now};
 const audit={PK:`AUDIT#${inst}`,SK:`PRACTICE-COMMENT#${now}#${id}`,entityType:'audit',action:'teacherPracticeComment',practiceId,studentId:practice.studentId,actor:claims.sub,at:now};
 await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,ConditionExpression:'attribute_not_exists(PK)'}},{Put:{TableName:table(),Item:audit,ConditionExpression:'attribute_not_exists(PK)'}}]}));
 return {record:{id,practiceId,studentId:practice.studentId,classId:practice.classId,comment,createdAt:now}};
}
export async function readPracticeComments(instRaw:string,practiceId:string){
 const inst=instOK(instRaw);
 const output:any[]=[];let next:any;
 do{const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':`PRACTICE_COMMENTS#${inst}#${practiceId}`},ExclusiveStartKey:next,Limit:100,ConsistentRead:true}));output.push(...(page.Items||[]));next=page.LastEvaluatedKey;if(output.length>500)throw httpError(413,'Too many comments');}while(next);
 return output.map(({id,practiceId,comment,createdAt}:any)=>({id,practiceId,comment,createdAt}));
}
export async function studentPracticeComments(instRaw:string,claims:Claims,studentId:string,practiceId:string){
 // The caller must first pass the learnerDashboard approved student relationship check.
 // This function additionally verifies the practice belongs to the selected student.
 const inst=instOK(instRaw);
 const row=(await db.send(new GetCommand({TableName:table(),Key:practiceKey(inst,practiceId),ConsistentRead:true}))).Item;
 if(!row||row.studentId!==studentId)throw httpError(404,'Practice entry not found');
 return readPracticeComments(inst,practiceId);
}
