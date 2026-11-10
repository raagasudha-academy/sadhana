/** Scoped homework: staff publishing, linked learner reading and completion. */
import {randomUUID} from 'node:crypto';
import {GetCommand,QueryCommand,TransactWriteCommand,PutCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {httpError,demandInstitution} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {myTeacherIdentity} from './teacherDirectory.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
import {isStudentRecordId} from './accessRules.ts';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
const instOK=(x:string):InstitutionId=>{if(x!=='raaga'&&x!=='sruti')throw httpError(400,'Invalid academy');return x};
const classOK=(x:unknown)=>typeof x==='string'&&/^CLASS-[a-z0-9-]{4,100}$/i.test(x);
const dateOK=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().startsWith(x);
import {validateHomeworkSchedule,isHomeworkReleased,isHomeworkOpenAt} from './homeworkPublishingPolicy.ts';
import {homeworkMediaRules,homeworkMediaAllowed,validateHomeworkMediaCounts} from './homeworkMediaPolicy.ts';
const pk=(inst:InstitutionId)=>`OPS#${inst}#HOMEWORK`;
async function all(pkValue:string){let cursor:any;const results:any[]=[];do{const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':pkValue},ExclusiveStartKey:cursor,Limit:100,ConsistentRead:true}));results.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;if(results.length>2000)throw httpError(413,'Too many homework records')}while(cursor);return results;}
async function linked(inst:InstitutionId,claims:Claims,studentId:string){
 if(!claims.sub||!isStudentRecordId(studentId))throw httpError(403,'Student access denied');
 const link=(await db.send(new GetCommand({TableName:table(),Key:{PK:`ACCESS#${inst}#${claims.sub}`,SK:`STUDENT#${studentId}`},ConsistentRead:true}))).Item;
 if(!link||link.status!=='approved'||link.institution!==inst||link.studentId!==studentId)throw httpError(403,'Student access not approved');
 const student=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${studentId}`},ConsistentRead:true}))).Item;
 if(!student||student.archived)throw httpError(403,'Student belongs to another academy');
 return student;
}
async function verifyTeacherClass(inst:InstitutionId,claims:Claims,classId:string){
 if(!classOK(classId))throw httpError(400,'Invalid class');
 const classRecord=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(classId)},ConsistentRead:true}))).Item;
 if(!classRecord||classRecord.recordType!=='class'||classRecord.institution!==inst||classRecord.lifecycleStatus==='archived')throw httpError(404,'Class unavailable');
 const teacher=await myTeacherIdentity(inst,claims).catch(()=>({linked:false,teacherId:null}));
 const assigned=teacher.linked&&classRecord.teacherId===teacher.teacherId;
 if(!assigned)demandInstitution(claims,inst);
 return classRecord;
}
export async function publishHomework(raw:string,claims:Claims,body:any){
 const inst=instOK(raw);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['classId','title','instructions','dueDate','releaseAt','dueTime','gradingEnabled'].includes(k)))throw httpError(400,'Unexpected homework fields');
 const {classId,title,instructions,dueDate}=body;
 let schedule;try{schedule=validateHomeworkSchedule(body.dueDate,body.dueTime,body.releaseAt,body.gradingEnabled)}catch(e){throw httpError(400,e instanceof Error?e.message:'Invalid publishing schedule')}
 if(!classOK(classId)||typeof title!=='string'||!title.trim()||title.length>120||typeof instructions!=='string'||!instructions.trim()||instructions.length>3000||!dateOK(dueDate))throw httpError(400,'Valid class, title, instructions and due date required');
 await verifyTeacherClass(inst,claims,classId);
 const now=new Date().toISOString(),id=`HOMEWORK-${randomUUID()}`;
 const item={PK:pk(inst),SK:`ITEM#${id}`,id,institution:inst,classId,title:title.trim(),instructions:instructions.trim(),dueDate,dueTime:schedule.dueTime,dueAt:schedule.dueAt,releaseAt:schedule.releaseAt,gradingEnabled:schedule.gradingEnabled,createdAt:now,createdBy:claims.sub,version:1};
 await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,ConditionExpression:'attribute_not_exists(PK)'}},{Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`HOMEWORK#${now}#${randomUUID()}`,action:'homeworkPublished',actor:claims.sub,homeworkId:id,classId,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}));
 return {record:{id,classId,title:item.title,instructions:item.instructions,dueDate}};
}
/** Edit and republish an existing assignment, retaining student submissions and material IDs. */
export async function republishHomework(raw:string,claims:Claims,classId:string,homeworkId:string,body:any){
 const inst=instOK(raw);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['title','instructions','dueDate','expectedVersion'].includes(k)))throw httpError(400,'Unexpected homework fields');
 const {title,instructions,dueDate,expectedVersion}=body;
 if(typeof title!=='string'||!title.trim()||title.length>120||typeof instructions!=='string'||!instructions.trim()||instructions.length>3000||!dateOK(dueDate)||!Number.isInteger(expectedVersion)||expectedVersion<1)throw httpError(400,'Invalid homework revision');
 const old=await teacherAssignment(inst,claims,classId,homeworkId);
 // Keep existing scheduling options, while recalculating the cutoff for the revised due date.
 let schedule;try{schedule=validateHomeworkSchedule(dueDate,old.dueTime||'23:59',old.releaseAt,old.gradingEnabled)}catch(e){throw httpError(400,e instanceof Error?e.message:'Invalid due date')}
 const now=new Date().toISOString();
 try{await db.send(new TransactWriteCommand({TransactItems:[
  {Update:{TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${homeworkId}`},UpdateExpression:'SET title=:title, instructions=:instructions, dueDate=:dueDate, dueAt=:dueAt, updatedAt=:now, updatedBy=:actor, #v=#v+:one',ConditionExpression:'#v=:expected AND classId=:classId AND institution=:inst',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':title':title.trim(),':instructions':instructions.trim(),':dueDate':dueDate,':dueAt':schedule.dueAt,':now':now,':actor':claims.sub,':one':1,':expected':expectedVersion,':classId':classId,':inst':inst}}},
  {Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`HOMEWORK-REPUBLISH#${now}#${randomUUID()}`,action:'homeworkRepublished',homeworkId,classId,actor:claims.sub,previousVersion:expectedVersion,version:expectedVersion+1,at:now},ConditionExpression:'attribute_not_exists(PK)'}}
 ]}));}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Homework was edited by someone else. Refresh before republishing.');throw e}
 return {record:{id:homeworkId,classId,title:title.trim(),instructions:instructions.trim(),dueDate,version:expectedVersion+1}};
}
export async function classHomework(raw:string,claims:Claims,classId:string){const inst=instOK(raw);await verifyTeacherClass(inst,claims,classId);return {records:(await all(pk(inst))).filter(h=>h.classId===classId).map(publicHomework)};}
const publicHomework=(h:any)=>({id:h.id,classId:h.classId,title:h.title,instructions:h.instructions,dueDate:h.dueDate,dueTime:h.dueTime||'23:59',dueAt:h.dueAt||null,releaseAt:h.releaseAt||null,gradingEnabled:h.gradingEnabled===true,createdAt:h.createdAt,materialIds:h.materialIds||[],version:h.version||1});
export async function learnerHomework(raw:string,claims:Claims,studentId:string){
 const inst=instOK(raw);await linked(inst,claims,studentId);
 const enrolments=(await all(`OPS#${inst}#ENROLMENT`)).filter(e=>e.studentId===studentId&&!e.archived);
 const list=(await all(pk(inst))).filter(h=>isHomeworkReleased(h)&&enrolments.some(e=>e.classId===h.classId&&e.startDate<=h.dueDate&&(!e.endDate||e.endDate>=h.dueDate)));
 const completed=(await all(`OPS#${inst}#HOMEWORK_COMPLETION`)).filter(c=>c.studentId===studentId);
 const records=await Promise.all(list.map(async h=>{
  const submission=(await db.send(new GetCommand({TableName:table(),Key:{PK:`OPS#${inst}#HOMEWORK_SUBMISSION#${h.id}`,SK:`STUDENT#${studentId}`},ConsistentRead:true}))).Item;
  return {...publicHomework(h),completed:completed.some(c=>c.homeworkId===h.id),submissionStatus:submission?.status==='submitted'?'submitted':submission?.status==='draft'?'draft':null,closed:!isHomeworkOpenAt(h)};
 }));
 return {records:records.sort((a,b)=>a.dueDate.localeCompare(b.dueDate))};
}
export async function completeHomework(raw:string,claims:Claims,studentId:string,body:any){
 const inst=instOK(raw);await linked(inst,claims,studentId);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['homeworkId','completed'].includes(k))||typeof body.homeworkId!=='string'||!/^HOMEWORK-[0-9a-f-]{36}$/i.test(body.homeworkId)||body.completed!==true)throw httpError(400,'Select homework to mark complete');
 const assignment=(await db.send(new GetCommand({TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${body.homeworkId}`},ConsistentRead:true}))).Item;
 if(!assignment||assignment.institution!==inst)throw httpError(404,'Homework not found');
 const enrolments=await all(`OPS#${inst}#ENROLMENT`);
 if(!enrolments.some(e=>e.studentId===studentId&&e.classId===assignment.classId&&!e.archived&&e.startDate<=assignment.dueDate&&(!e.endDate||e.endDate>=assignment.dueDate)))throw httpError(403,'Not enrolled in this assignment class');
 const now=new Date().toISOString();
 try{await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:{PK:`OPS#${inst}#HOMEWORK_COMPLETION`,SK:`STUDENT#${studentId}#${assignment.id}`,studentId,homeworkId:assignment.id,completedAt:now,completedBy:claims.sub},ConditionExpression:'attribute_not_exists(PK)'}},{Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`HOMEWORK-COMPLETE#${now}#${randomUUID()}`,action:'homeworkCompleted',studentId,homeworkId:assignment.id,actor:claims.sub,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}));}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Homework already completed; refresh');throw e;}
 return {completed:true,homeworkId:assignment.id};
}

// v12.7.8: Assignment-specific drafts, revisions and teacher review.
const submissionPK=(inst:InstitutionId,id:string)=>`OPS#${inst}#HOMEWORK_SUBMISSION#${id}`;
const ukToday=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).split('/').reverse().join('-');
export function isHomeworkOpen(dueDate:string,today:string=ukToday()){return dateOK(dueDate)&&today<=dueDate;}
async function eligibleAssignment(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string){
 await linked(inst,claims,studentId);
 if(!/^HOMEWORK-[0-9a-f-]{36}$/i.test(homeworkId))throw httpError(400,'Invalid assignment');
 const h=(await db.send(new GetCommand({TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${homeworkId}`},ConsistentRead:true}))).Item;
 if(!h||h.institution!==inst)throw httpError(404,'Assignment not found');
 const enrollments=await all(`OPS#${inst}#ENROLMENT`);
 if(!enrollments.some(e=>e.studentId===studentId&&e.classId===h.classId&&!e.archived&&e.startDate<=h.dueDate&&(!e.endDate||e.endDate>=h.dueDate)))throw httpError(403,'Not enrolled in this assignment class');
 return h;
}
export async function saveHomeworkSubmission(instRaw:string,claims:Claims,studentId:string,homeworkId:string,body:any){
 const inst=instOK(instRaw);const assignment=await eligibleAssignment(inst,claims,studentId,homeworkId);
 if(!isHomeworkReleased(assignment)||!isHomeworkOpenAt(assignment))throw httpError(409,'The homework deadline has passed; this submission is read-only');
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['text','status','expectedVersion','attachmentIds'].includes(k)))throw httpError(400,'Unexpected submission fields');
 if(typeof body.text!=='string'||body.text.length>10000||!['draft','submitted'].includes(body.status)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0||!Array.isArray(body.attachmentIds)||body.attachmentIds.length>3||new Set(body.attachmentIds).size!==body.attachmentIds.length||body.attachmentIds.some((x:any)=>typeof x!=='string'||!/^MEDIA#[a-zA-Z0-9-]+#[0-9a-f-]{36}$/.test(x)))throw httpError(400,'Invalid homework response or attachments');
 if(body.status==='submitted'&&!body.text.trim()&&!body.attachmentIds.length)throw httpError(400,'Enter a response or attach evidence before submitting');
 const selectedMimes:string[]=[];
 for(const id of body.attachmentIds){const attachment=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:id},ConsistentRead:true}))).Item;
  if(!attachment||attachment.studentId!==studentId||attachment.purpose!=='homework'||attachment.institution!==inst||attachment.homeworkId!==homeworkId)throw httpError(403,'Evidence does not belong to this student and assignment');
  selectedMimes.push(String(attachment.mime));}
 if(!validateHomeworkMediaCounts(selectedMimes))throw httpError(400,'Homework allows up to three images (5 MB each)');
 const key={PK:submissionPK(inst,homeworkId),SK:`STUDENT#${studentId}`};
 const old=(await db.send(new GetCommand({TableName:table(),Key:key,ConsistentRead:true}))).Item;
 if((old?.version||0)!==body.expectedVersion)throw httpError(409,'Submission changed. Refresh before saving');
 if(old?.reviewedAt)throw httpError(409,'Teacher-reviewed homework is locked; ask the teacher to reopen it');
 const now=new Date().toISOString();
 const item={...key,studentId,homeworkId,classId:assignment.classId,institution:inst,text:body.text.trim(),attachmentIds:body.attachmentIds,status:body.status,version:body.expectedVersion+1,updatedAt:now,updatedBy:claims.sub,submittedAt:body.status==='submitted'?now:(old?.submittedAt||null)};
 try{await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,ConditionExpression:old?'#v=:v':'attribute_not_exists(PK)',...(old?{ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':body.expectedVersion}}:{})}},{Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`HOMEWORK-SUBMISSION#${now}#${randomUUID()}`,action:'homeworkSubmissionSaved',studentId,homeworkId,status:body.status,actor:claims.sub,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}));}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Submission changed. Refresh before saving');throw e;}
 return {record:publicSubmission(item)};
}
const publicSubmission=(r:any)=>({studentId:r.studentId,homeworkId:r.homeworkId,text:r.text||'',attachmentIds:r.attachmentIds||[],status:r.status,version:r.version||0,updatedAt:r.updatedAt||'',submittedAt:r.submittedAt||null,feedback:r.feedback||'',reviewedAt:r.reviewedAt||null});
export async function getHomeworkSubmission(instRaw:string,claims:Claims,studentId:string,homeworkId:string){
 const inst=instOK(instRaw);const h=await eligibleAssignment(inst,claims,studentId,homeworkId);
 const item=(await db.send(new GetCommand({TableName:table(),Key:{PK:submissionPK(inst,homeworkId),SK:`STUDENT#${studentId}`},ConsistentRead:true}))).Item;
 return {record:item?publicSubmission(item):{studentId,homeworkId,text:'',attachmentIds:[],status:'draft',version:0,feedback:''},editable:isHomeworkReleased(h)&&isHomeworkOpenAt(h)&&!item?.reviewedAt,dueDate:h.dueDate};
}
export async function teacherHomeworkSubmissions(instRaw:string,claims:Claims,classId:string,homeworkId:string){
 const inst=instOK(instRaw);await verifyTeacherClass(inst,claims,classId);
 const assignment=(await db.send(new GetCommand({TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${homeworkId}`}}))).Item;
 if(!assignment||assignment.classId!==classId||assignment.institution!==inst)throw httpError(404,'Homework not found in this class');
 const records=await all(submissionPK(inst,homeworkId));
 return {records:records.filter(x=>x.status==='submitted').map(publicSubmission)};
}
export async function teacherHomeworkFeedback(instRaw:string,claims:Claims,classId:string,homeworkId:string,studentId:string,body:any){
 const inst=instOK(instRaw);await verifyTeacherClass(inst,claims,classId);
 const assignment=(await db.send(new GetCommand({TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${homeworkId}`}}))).Item;
 if(!assignment||assignment.classId!==classId||assignment.institution!==inst)throw httpError(404,'Assignment not found');
 if(!body||Object.keys(body).some(k=>!['feedback','expectedVersion'].includes(k))||typeof body.feedback!=='string'||body.feedback.length>2000||!Number.isInteger(body.expectedVersion))throw httpError(400,'Invalid feedback');
 const key={PK:submissionPK(inst,homeworkId),SK:`STUDENT#${studentId}`};const old=(await db.send(new GetCommand({TableName:table(),Key:key,ConsistentRead:true}))).Item;
 if(!old||old.status!=='submitted')throw httpError(404,'Submitted homework not found');
 if(old.version!==body.expectedVersion)throw httpError(409,'Submission has changed');
 const now=new Date().toISOString();
 await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:{...old,feedback:body.feedback.trim(),reviewedAt:now,reviewedBy:claims.sub,version:old.version+1},ConditionExpression:'#v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':body.expectedVersion}}},{Put:{TableName:table(),Item:{PK:`AUDIT#${inst}`,SK:`HOMEWORK-FEEDBACK#${now}#${randomUUID()}`,action:'homeworkFeedbackSaved',studentId,homeworkId,actor:claims.sub,at:now},ConditionExpression:'attribute_not_exists(PK)'}}]}));
 return {saved:true};
}

// Assignment-bound private evidence. Never issue a URL before academy permission and deadline checks.
const evidenceS3=new S3Client({requestChecksumCalculation:"WHEN_REQUIRED"});
const evidenceBucket=()=>{if(!process.env.SADHANA_LEARNER_MEDIA_BUCKET)throw httpError(503,'Private learner media storage not configured');return process.env.SADHANA_LEARNER_MEDIA_BUCKET};
const evidenceTypes:Record<string,{ext:string,max:number}>=homeworkMediaRules;
export async function beginHomeworkEvidence(instRaw:string,claims:Claims,studentId:string,homeworkId:string,body:any){
 const inst=instOK(instRaw);const assignment=await eligibleAssignment(inst,claims,studentId,homeworkId);
 if(!isHomeworkReleased(assignment)||!isHomeworkOpenAt(assignment))throw httpError(409,'Homework deadline has passed');
 if(!body||Object.keys(body).some(k=>!['mime','size'].includes(k)))throw httpError(400,'Invalid attachment fields');
 const type=evidenceTypes[String(body.mime)];if(!type||!homeworkMediaAllowed(String(body.mime),body.size))throw httpError(400,'Unsupported file type or size');
 const key=`homework-private/${inst}/${studentId}/${homeworkId}/${randomUUID()}.${type.ext}`;
 const url=await getSignedUrl(evidenceS3,new PutObjectCommand({Bucket:evidenceBucket(),Key:key,ContentType:body.mime,ContentLength:body.size,Metadata:{institution:inst,student:studentId,homework:homeworkId}}),{expiresIn:300,unhoistableHeaders:new Set(['x-amz-meta-institution','x-amz-meta-student','x-amz-meta-homework'])});
 return {uploadUrl:url,key,expiresIn:300,headers:{'Content-Type':body.mime,'x-amz-meta-institution':inst,'x-amz-meta-student':studentId,'x-amz-meta-homework':homeworkId}};
}
export async function finishHomeworkEvidence(instRaw:string,claims:Claims,studentId:string,homeworkId:string,body:any){
 const inst=instOK(instRaw);const assignment=await eligibleAssignment(inst,claims,studentId,homeworkId);
 if(!isHomeworkReleased(assignment)||!isHomeworkOpenAt(assignment))throw httpError(409,'Homework deadline has passed');
 if(!body||typeof body.key!=='string'||Object.keys(body).some(k=>k!=='key')||!body.key.startsWith(`homework-private/${inst}/${studentId}/${homeworkId}/`)||!/\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(body.key))throw httpError(400,'Invalid attachment reference');
 const head=await evidenceS3.send(new HeadObjectCommand({Bucket:evidenceBucket(),Key:body.key}));
 const type=evidenceTypes[String(head.ContentType)];
 if(!type||!head.ContentLength||head.ContentLength>type.max||head.Metadata?.institution!==inst||head.Metadata?.student!==studentId||head.Metadata?.homework!==homeworkId)throw httpError(409,'Attachment metadata does not match this student and assignment');
 const id=randomUUID();const sk=`MEDIA#${studentId}#${id}`;
 await db.send(new PutCommand({TableName:table(),Item:{PK:'OPS#GLOBAL#STUDENT',SK:sk,studentId,institution:inst,homeworkId,purpose:'homework',objectKey:body.key,mime:head.ContentType,size:head.ContentLength,uploadedBy:claims.sub,createdAt:new Date().toISOString()},ConditionExpression:'attribute_not_exists(PK)'}));
 return {attachmentId:sk};
}
export async function homeworkEvidenceLinks(instRaw:string,claims:Claims,studentId:string,homeworkId:string){
 const inst=instOK(instRaw);await eligibleAssignment(inst,claims,studentId,homeworkId);
 const saved=(await db.send(new GetCommand({TableName:table(),Key:{PK:submissionPK(inst,homeworkId),SK:`STUDENT#${studentId}`},ConsistentRead:true}))).Item;
 return {records:await Promise.all((saved?.attachmentIds||[]).map(async (id:string)=>{
 const meta=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:id}}))).Item;
 if(!meta||meta.studentId!==studentId||meta.institution!==inst||meta.homeworkId!==homeworkId)throw httpError(403,'Attachment access denied');
 return {id,mime:meta.mime,url:await getSignedUrl(evidenceS3,new GetObjectCommand({Bucket:evidenceBucket(),Key:meta.objectKey}),{expiresIn:180})};
 }))};
}
export async function teacherHomeworkEvidenceLinks(instRaw:string,claims:Claims,classId:string,homeworkId:string,studentId:string){
 const inst=instOK(instRaw);await verifyTeacherClass(inst,claims,classId);
 const assignment=(await db.send(new GetCommand({TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${homeworkId}`}}))).Item;
 if(!assignment||assignment.classId!==classId||assignment.institution!==inst)throw httpError(404,'Assignment unavailable');
 const saved=(await db.send(new GetCommand({TableName:table(),Key:{PK:submissionPK(inst,homeworkId),SK:`STUDENT#${studentId}`}}))).Item;
 if(!saved||saved.status!=='submitted')throw httpError(404,'No submitted homework');
 return {records:await Promise.all((saved.attachmentIds||[]).map(async (id:string)=>{
  const m=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:id}}))).Item;
  if(!m||m.studentId!==studentId||m.institution!==inst||m.homeworkId!==homeworkId)throw httpError(403,'Attachment access denied');
  return {id,mime:m.mime,url:await getSignedUrl(evidenceS3,new GetObjectCommand({Bucket:evidenceBucket(),Key:m.objectKey}),{expiresIn:180})};
 }))};
}


// Private teacher-provided assignment materials: stored separately from student responses.
async function teacherAssignment(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string){
 await verifyTeacherClass(inst,claims,classId);
 if(!/^HOMEWORK-[0-9a-f-]{36}$/i.test(homeworkId))throw httpError(400,'Invalid homework');
 const record=(await db.send(new GetCommand({TableName:table(),Key:{PK:pk(inst),SK:`ITEM#${homeworkId}`},ConsistentRead:true}))).Item;
 if(!record||record.institution!==inst||record.classId!==classId)throw httpError(404,'Assignment unavailable');
 return record;
}
const materialSK=(homeworkId:string)=>`MATERIALS#${homeworkId}`;
export async function beginTeacherHomeworkMaterial(raw:string,claims:Claims,classId:string,homeworkId:string,body:any){
 const inst=instOK(raw),assignment=await teacherAssignment(inst,claims,classId,homeworkId);
 if(!isHomeworkOpenAt(assignment))throw httpError(409,'Assignment deadline has passed');
 if(!body||Object.keys(body).some(k=>!['mime','size'].includes(k))||!homeworkMediaAllowed(body.mime,body.size))throw httpError(400,'Invalid material type or size');
 const type=evidenceTypes[String(body.mime)],key=`homework-private/${inst}/teacher/${classId}/${homeworkId}/${randomUUID()}.${type.ext}`;
 const headers={'Content-Type':body.mime,'x-amz-meta-institution':inst,'x-amz-meta-class':classId,'x-amz-meta-homework':homeworkId};
 return {key,headers,uploadUrl:await getSignedUrl(evidenceS3,new PutObjectCommand({Bucket:evidenceBucket(),Key:key,ContentType:body.mime,ContentLength:body.size,Metadata:{institution:inst,class:classId,homework:homeworkId}}),{expiresIn:300,unhoistableHeaders:new Set(['x-amz-meta-institution','x-amz-meta-class','x-amz-meta-homework'])})};
}
export async function finishTeacherHomeworkMaterial(raw:string,claims:Claims,classId:string,homeworkId:string,body:any){
 const inst=instOK(raw),assignment=await teacherAssignment(inst,claims,classId,homeworkId);
 if(!isHomeworkOpenAt(assignment))throw httpError(409,'Assignment deadline has passed');
 if(!body||typeof body.key!=='string'||Object.keys(body).some(k=>k!=='key')||!body.key.startsWith(`homework-private/${inst}/teacher/${classId}/${homeworkId}/`)||!/\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(body.key))throw httpError(400,'Invalid material key');
 const head=await evidenceS3.send(new HeadObjectCommand({Bucket:evidenceBucket(),Key:body.key}));
 if(!homeworkMediaAllowed(String(head.ContentType),Number(head.ContentLength))||head.Metadata?.institution!==inst||head.Metadata?.class!==classId||head.Metadata?.homework!==homeworkId)throw httpError(409,'Material verification failed');
 const id=`MATERIAL#${randomUUID()}`,record={id,key:body.key,mime:head.ContentType,size:head.ContentLength,createdAt:new Date().toISOString(),uploadedBy:claims.sub};
 await db.send(new PutCommand({TableName:table(),Item:{PK:`OPS#${inst}#HOMEWORK_MATERIAL`,SK:id,homeworkId,classId,institution:inst,...record},ConditionExpression:'attribute_not_exists(PK)'}));
 return {record:{id,mime:record.mime,size:record.size}};
}
export async function setTeacherHomeworkMaterials(raw:string,claims:Claims,classId:string,homeworkId:string,body:any){
 const inst=instOK(raw),assignment=await teacherAssignment(inst,claims,classId,homeworkId);
 if(!isHomeworkOpenAt(assignment))throw httpError(409,'Assignment deadline has passed');
 if(!body||!Number.isInteger(body.expectedVersion)||body.expectedVersion<1||!Array.isArray(body.ids)||body.ids.length>3||new Set(body.ids).size!==body.ids.length||body.ids.some((id:any)=>typeof id!=='string'||!/^MATERIAL#[0-9a-f-]{36}$/.test(id)))throw httpError(400,'Invalid attachment selection');
 const selected=[] as any[];
 for(const id of body.ids){const r=(await db.send(new GetCommand({TableName:table(),Key:{PK:`OPS#${inst}#HOMEWORK_MATERIAL`,SK:id},ConsistentRead:true}))).Item;
  if(!r||r.homeworkId!==homeworkId||r.classId!==classId||r.institution!==inst)throw httpError(403,'Material not owned by this assignment');selected.push(r);}
 if(!validateHomeworkMediaCounts(selected.map(x=>x.mime)))throw httpError(400,'Maximum three images (5 MB each)');
 // Version-aware replacement prevents lost updates when multiple teachers edit concurrently.
 const key={PK:pk(inst),SK:`ITEM#${homeworkId}`};
 const {UpdateCommand}=await import('@aws-sdk/lib-dynamodb');
 try{await db.send(new UpdateCommand({TableName:table(),Key:key,UpdateExpression:'SET materialIds=:ids, #v=#v+:one',ConditionExpression:'#v=:expected',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':ids':body.ids,':one':1,':expected':body.expectedVersion}}));}
 catch(e:any){if(e.name==='ConditionalCheckFailedException')throw httpError(409,'Assignment changed. Refresh and retry');throw e;}
 return {saved:true};
}
async function materialLinks(inst:InstitutionId,assignment:any){
 const ids:Array<string>=assignment.materialIds||[];
 return {records:await Promise.all(ids.map(async id=>{const r=(await db.send(new GetCommand({TableName:table(),Key:{PK:`OPS#${inst}#HOMEWORK_MATERIAL`,SK:id}}))).Item;
 if(!r||r.homeworkId!==assignment.id||r.institution!==inst||r.classId!==assignment.classId)throw httpError(403,'Material access denied');
 return {id,mime:r.mime,size:r.size,url:await getSignedUrl(evidenceS3,new GetObjectCommand({Bucket:evidenceBucket(),Key:r.key}),{expiresIn:180})};}))};
}
export async function teacherHomeworkMaterialLinks(raw:string,claims:Claims,classId:string,homeworkId:string){const inst=instOK(raw);return materialLinks(inst,await teacherAssignment(inst,claims,classId,homeworkId));}
export async function learnerHomeworkMaterialLinks(raw:string,claims:Claims,studentId:string,homeworkId:string){const inst=instOK(raw);const h=await eligibleAssignment(inst,claims,studentId,homeworkId);if(!isHomeworkReleased(h))throw httpError(403,'Assignment not released');return materialLinks(inst,h);}
