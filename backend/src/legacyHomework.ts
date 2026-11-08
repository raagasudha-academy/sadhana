import {entityTable} from './entityTables.mjs';
/** Isolated M9 homework and submission storage. No legacy PK/SK reads or writes. */
import {randomUUID} from 'node:crypto';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {validateM9MediaSelection,validateM9MediaType,m9MediaId} from './mediaPolicy.mjs';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,permittedInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {matchingCognitoPerson,authorisedStudent} from './finalAccessCore.mjs';
import {validateHomeworkSchedule,isHomeworkOpenAt,isHomeworkReleased} from './homeworkPublishingPolicy.ts';

export type HomeworkDB={send:(command:any)=>Promise<any>};
const table=(entity:string)=>entityTable(entity);
const assignmentId=(v:unknown)=>typeof v==='string'&&/^HOMEWORK-[0-9a-f-]{36}$/i.test(v);
const teacherMaterialId=(v:unknown)=>typeof v==='string'&&/^MATERIAL#[0-9a-f-]{36}$/i.test(v);
const teacherMaterialType=(mime:unknown,size:unknown)=>typeof mime==='string'&&['image/jpeg','image/png','image/webp'].includes(mime)&&Number.isSafeInteger(size)&&Number(size)>0&&Number(size)<=5_000_000;
const teacherMaterialExt=(mime:string)=>({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as Record<string,string>)[mime];
const acceptableId=(v:unknown)=>typeof v==='string'&&/^[-a-zA-Z0-9_]{4,150}$/.test(v);
const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const allowFields=(v:Record<string,any>,fields:string[])=>Object.keys(v).every(k=>fields.includes(k));
const conflict=(e:any)=>{if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))throw httpError(409,'Record or access changed. Refresh and retry.');throw e;};
const publicHomework=(h:any)=>({id:h.homeworkId,classId:h.classId,title:h.title,instructions:h.instructions,dueDate:h.dueDate,dueTime:h.dueTime||'23:59',dueAt:h.dueAt||null,releaseAt:h.releaseAt||null,gradingEnabled:h.gradingEnabled===true,createdAt:h.createdAt,materialIds:h.materialIds||[],version:h.version||1});
const publicSubmission=(s:any)=>({studentId:s.studentId,homeworkId:s.homeworkId,text:s.text||'',attachmentIds:s.attachmentIds||[],status:s.status,version:s.version||0,updatedAt:s.updatedAt||'',submittedAt:s.submittedAt||null,feedback:s.feedback||'',reviewedAt:s.reviewedAt||null});
const nowIso=()=>new Date().toISOString();
export type M9MediaIO={head:(bucket:string,key:string)=>Promise<any>,signPut:(bucket:string,key:string,mime:string,size:number,metadata:Record<string,string>)=>Promise<string>,signGet:(bucket:string,key:string)=>Promise<string>};
const mediaEnabled=()=>process.env.SADHANA_ENTITY_TABLE_SET==='final' ? process.env.SADHANA_FINAL_HOMEWORK_MEDIA==='enabled' : process.env.M9_HOMEWORK_MEDIA==='enabled';
const mediaBucket=()=>{const bucket=process.env.SADHANA_LEARNER_MEDIA_BUCKET;if(!bucket)throw httpError(503,'Private homework media bucket not configured');return bucket;};
const mediaS3=new S3Client({requestChecksumCalculation:'WHEN_REQUIRED'});
const realMediaIO:M9MediaIO={
 head:(bucket,key)=>mediaS3.send(new HeadObjectCommand({Bucket:bucket,Key:key})),
 signPut:(bucket,key,mime,size,metadata)=>getSignedUrl(mediaS3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:mime,ContentLength:size,Metadata:metadata}),{expiresIn:300,unhoistableHeaders:new Set(Object.keys(metadata).map(k=>`x-amz-meta-${k}`))}),
 signGet:(bucket,key)=>getSignedUrl(mediaS3,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:180}),
};
export function makeM9Homework(db:HomeworkDB,mediaIO:M9MediaIO=realMediaIO){
 const get=async(kind:string,id:string)=>(await db.send(new GetCommand({TableName:table(kind),Key:{[kind==='homework'?'homeworkId':kind==='submissions'?'submissionId':kind==='people'?'personId':kind==='classes'?'classId':kind==='enrolments'?'enrolmentId':'linkId']:id},ConsistentRead:true}))).Item||null;
 async function query(kind:string,index:string,key:string,value:string){
  const rows:any[]=[];let cursor:any;
  do{const page=await db.send(new QueryCommand({TableName:table(kind),IndexName:index,KeyConditionExpression:'#key=:value',ExpressionAttributeNames:{'#key':key},ExpressionAttributeValues:{':value':value},ExclusiveStartKey:cursor,Limit:100}));rows.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;if(rows.length>2000)throw httpError(413,'Too many records');}while(cursor);
  return rows;
 }
 async function identity(inst:InstitutionId,claims:Claims){
  if(!['raaga','sruti'].includes(inst)||!claims.sub)throw httpError(403,'Authenticated academy access required');
  const actor=matchingCognitoPerson(await query('people','CognitoIdentityIndex','cognitoSub',claims.sub),claims.sub,inst);
  if(!actor)throw httpError(403,'Verified academy identity required');
  const fresh=await get('people',actor.personId);
  if(!fresh||fresh.status!=='active'||fresh.cognitoSub!==claims.sub||!fresh.institutionIds?.includes(inst))throw httpError(403,'Verified academy identity required');
  const check={ConditionCheck:{TableName:table('people'),Key:{personId:fresh.personId},ConditionExpression:'#status=:active AND cognitoSub=:sub AND contains(institutionIds,:inst)',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active',':sub':claims.sub,':inst':inst}}};
  return {actor:fresh,check};
 }
 async function staff(inst:InstitutionId,claims:Claims,classId:string){
  if(!acceptableId(classId))throw httpError(400,'Invalid class identifier');
  const {actor,check}=await identity(inst,claims);
  const cls=await get('classes',classId);
  if(!cls||cls.institutionId!==inst||cls.status==='archived')throw httpError(404,'Class unavailable');
  const admin=permittedInstitutions(claims).includes(inst);
  const assigned=actor.personTypes?.includes('teacher') && cls.teacherPersonIds?.includes(actor.personId);
  if(!admin&&!assigned)throw httpError(403,'Teacher assignment or administrator permission required');
  const classCheck={ConditionCheck:{TableName:table('classes'),Key:{classId},ConditionExpression:'institutionId=:inst AND #status<>:archived'+(admin?'':' AND contains(teacherPersonIds,:teacher)'),ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':inst':inst,':archived':'archived',...(admin?{}:{':teacher':actor.personId})}}};
  return {actor,checks:[check,classCheck],classRecord:cls};
 }
 async function learner(inst:InstitutionId,claims:Claims,studentId:string){
  if(!acceptableId(studentId))throw httpError(400,'Invalid learner identifier');
  const {actor,check}=await identity(inst,claims);
  const student=await get('people',studentId);
  let links:any[]=[];
  if(actor.personId!==studentId){
   const candidates=await query('family-links','GuardianAccessIndex','guardianPersonId',actor.personId);
   links=(await Promise.all(candidates.filter(x=>x.studentId===studentId&&x.institutionId===inst).map(x=>get('family-links',x.linkId)))).filter(Boolean);
  }
  authorisedStudent(actor,student,links,inst);
  const checks:any[]=[check,{ConditionCheck:{TableName:table('people'),Key:{personId:studentId},ConditionExpression:'#status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:student)',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active',':inst':inst,':student':'student'}}}];
  if(actor.personId!==studentId){
   const link=links.find(x=>x.guardianPersonId===actor.personId&&x.studentId===studentId&&x.institutionId===inst&&x.accessStatus==='approved'&&x.relationshipVerified===true);
   checks.push({ConditionCheck:{TableName:table('family-links'),Key:{linkId:link.linkId},ConditionExpression:'guardianPersonId=:g AND studentId=:s AND institutionId=:i AND accessStatus=:approved AND relationshipVerified=:yes',ExpressionAttributeValues:{':g':actor.personId,':s':studentId,':i':inst,':approved':'approved',':yes':true}}});
  }
  return {actor,checks};
 }
 async function enrolment(inst:InstitutionId,studentId:string,classId:string,dueDate:string){
  const list=await query('enrolments','StudentEnrolmentsIndex','studentId',studentId);
  const choices=list.filter(x=>x.institutionId===inst&&x.classId===classId&&x.status==='active'&&(!x.startDate||x.startDate<=dueDate)&&(!x.endDate||x.endDate>=dueDate));
  for(const candidate of choices){
   const fresh=await get('enrolments',candidate.enrolmentId);
   if(!fresh||fresh.institutionId!==inst||fresh.studentId!==studentId||fresh.classId!==classId||fresh.status!=='active'||(fresh.startDate&&fresh.startDate>dueDate)||(fresh.endDate&&fresh.endDate<dueDate))continue;
   return {ConditionCheck:{TableName:table('enrolments'),Key:{enrolmentId:fresh.enrolmentId},ConditionExpression:'#status=:active AND institutionId=:inst AND studentId=:student AND classId=:class AND (attribute_not_exists(startDate) OR startDate<=:date) AND (attribute_not_exists(endDate) OR endDate>=:date)',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':active':'active',':inst':inst,':student':studentId,':class':classId,':date':dueDate}}};
  }
  throw httpError(403,'Student is not enrolled in this class');
 }
 const audit=(inst:string,claims:Claims,actor:any,action:string,resourceId:string)=>({auditId:`AUDIT-${randomUUID()}`,institutionId:inst,action,actorCognitoSub:claims.sub,actorPersonId:actor.personId,timestamp:nowIso(),resourceType:'homework',resourceId});
 const checkAssignment=(inst:string,h:any)=>h&&h.institutionId===inst&&h.status!=='archived';
 async function assignment(inst:InstitutionId,studentId:string,homeworkId:string){
  if(!assignmentId(homeworkId))throw httpError(400,'Invalid homework identifier');
  const h=await get('homework',homeworkId);
  if(!checkAssignment(inst,h))throw httpError(404,'Homework unavailable');
  const enrollmentCheck=await enrolment(inst,studentId,h.classId,h.dueDate);
  return {h,enrollmentCheck};
 }
 async function listClass(inst:InstitutionId,claims:Claims,classId:string){await staff(inst,claims,classId);return {records:(await query('homework','ClassHomeworkIndex','classId',classId)).filter(h=>checkAssignment(inst,h)).map(publicHomework)};}
 async function publish(inst:InstitutionId,claims:Claims,classId:string,body:any){
  if(!isObject(body)||!allowFields(body,['classId','title','instructions','dueDate','dueTime','releaseAt','gradingEnabled']))throw httpError(400,'Invalid homework request');
  if(body.classId!==undefined&&body.classId!==classId)throw httpError(400,'Class mismatch');
  const {actor,checks}=await staff(inst,claims,classId);
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120||typeof body.instructions!=='string'||!body.instructions.trim()||body.instructions.length>3000)throw httpError(400,'Title and instructions required');
  let schedule;try{schedule=validateHomeworkSchedule(body.dueDate,body.dueTime,body.releaseAt,body.gradingEnabled);}catch(e){throw httpError(400,(e as Error).message)}
  const id=`HOMEWORK-${randomUUID()}`,now=nowIso();
  const item={homeworkId:id,institutionId:inst,classId,teacherPersonId:actor.personId,title:body.title.trim(),instructions:body.instructions.trim(),dueDate:body.dueDate,...schedule,publishAt:schedule.releaseAt||now,status:'active',materialIds:[],version:1,createdAt:now,createdBy:claims.sub};
  if(!item.releaseAt)delete (item as any).releaseAt;
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Put:{TableName:table('homework'),Item:item,ConditionExpression:'attribute_not_exists(homeworkId)'}},{Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkPublished',id),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
  return {record:{id,classId,title:item.title,instructions:item.instructions,dueDate:item.dueDate}};
 }
 async function edit(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string,body:any){
  if(!assignmentId(homeworkId)||!isObject(body)||!allowFields(body,['title','instructions','dueDate','expectedVersion']))throw httpError(400,'Invalid homework update');
  const {actor,checks}=await staff(inst,claims,classId),old=await get('homework',homeworkId);
  if(!checkAssignment(inst,old)||old.classId!==classId)throw httpError(404,'Assignment unavailable');
  if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==old.version)throw httpError(409,'Homework changed. Refresh first');
  if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120||typeof body.instructions!=='string'||!body.instructions.trim()||body.instructions.length>3000)throw httpError(400,'Invalid title or instructions');
  let schedule;try{schedule=validateHomeworkSchedule(body.dueDate,old.dueTime,old.releaseAt,old.gradingEnabled);}catch(e){throw httpError(400,(e as Error).message)}
  const updated={...old,title:body.title.trim(),instructions:body.instructions.trim(),dueDate:body.dueDate,dueAt:schedule.dueAt,version:old.version+1,updatedAt:nowIso(),updatedBy:claims.sub};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Put:{TableName:table('homework'),Item:updated,ConditionExpression:'#version=:version AND institutionId=:inst AND classId=:class',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':version':old.version,':inst':inst,':class':classId}}},{Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkRepublished',homeworkId),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
  return {record:{id:homeworkId,classId,title:updated.title,instructions:updated.instructions,dueDate:updated.dueDate,version:updated.version}};
 }
 async function remove(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string){
  if(!assignmentId(homeworkId))throw httpError(400,'Invalid homework identifier');
  const {actor,checks}=await staff(inst,claims,classId);
  const old=await get('homework',homeworkId);
  if(!checkAssignment(inst,old)||old.classId!==classId)throw httpError(404,'Homework unavailable');
  const now=nowIso();
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,
   {Update:{TableName:table('homework'),Key:{homeworkId},
    UpdateExpression:'SET #status=:archived, archivedAt=:now, archivedBy=:actor, #version=:next',
    ConditionExpression:'institutionId=:inst AND classId=:class AND #status<>:archived AND #version=:expected',
    ExpressionAttributeNames:{'#status':'status','#version':'version'},
    ExpressionAttributeValues:{':archived':'archived',':now':now,':actor':claims.sub,':inst':inst,':class':classId,':expected':old.version,':next':old.version+1}}},
   {Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkArchived',homeworkId),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}
  catch(e){conflict(e)}
  return {deleted:true,archived:true};
 }
 async function learnerList(inst:InstitutionId,claims:Claims,studentId:string){
  await learner(inst,claims,studentId);
  const enrolled=(await query('enrolments','StudentEnrolmentsIndex','studentId',studentId)).filter(e=>e.institutionId===inst&&e.status==='active');
  const ids=[...new Set(enrolled.map(e=>e.classId))];if(ids.length>100)throw httpError(413,'Too many classes');
  const assignments=(await Promise.all(ids.map(id=>query('homework','ClassHomeworkIndex','classId',id)))).flat().filter(h=>checkAssignment(inst,h)&&isHomeworkReleased(h)&&enrolled.some(e=>e.classId===h.classId&&(!e.startDate||e.startDate<=h.dueDate)&&(!e.endDate||e.endDate>=h.dueDate)));
  const submissions=await query('submissions','StudentSubmissionsIndex','studentId',studentId);
  return {records:assignments.map(h=>{const s=submissions.find(s=>s.submissionId===`SUBMISSION-${h.homeworkId}-${studentId}`&&s.institutionId===inst);return {...publicHomework(h),completed:s?.status==='submitted'||s?.completed===true,submissionStatus:s?.status||null,closed:!isHomeworkOpenAt(h)};}).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))};
 }
 async function getSubmission(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string){
  await learner(inst,claims,studentId);const {h}=await assignment(inst,studentId,homeworkId);
  const item=await get('submissions',`SUBMISSION-${homeworkId}-${studentId}`);
  if(item&&(item.institutionId!==inst||item.studentId!==studentId||item.homeworkId!==homeworkId))throw httpError(403,'Submission access denied');
  return {record:item?publicSubmission(item):{studentId,homeworkId,text:'',attachmentIds:[],status:'draft',version:0,feedback:''},editable:isHomeworkReleased(h)&&isHomeworkOpenAt(h)&&!item?.reviewedAt,dueDate:h.dueDate};
 }
 async function mediaAccess(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string){
  const {actor,checks}=await learner(inst,claims,studentId);
  const {h,enrollmentCheck}=await assignment(inst,studentId,homeworkId);
  if(!isHomeworkReleased(h)||!isHomeworkOpenAt(h))throw httpError(409,'Homework is not currently open');
  const existing=await get('submissions',`SUBMISSION-${homeworkId}-${studentId}`);
  if(existing?.reviewedAt)throw httpError(409,'Reviewed homework is locked');
  return {actor,checks:[...checks,enrollmentCheck],h};
 }
 // Upload receipts live in the existing M9 submissions table, under unique MEDIA-* keys.
 // They cannot appear as student submissions, and do not require a new table or legacy keys.
 async function mediaStart(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string,body:any){
  if(!mediaEnabled())throw httpError(503,'M9 media integration disabled');
  if(!isObject(body)||!allowFields(body,['mime','size'])||typeof body.mime!=='string')throw httpError(400,'Invalid media request');
  const type=validateM9MediaType(body.mime,body.size);
  if(!type)throw httpError(400,'Unsupported file type or size');
  const {actor,checks}=await mediaAccess(inst,claims,studentId,homeworkId);
  const bucket=mediaBucket();
  const id=`MEDIA-${randomUUID()}`,key=`m9-homework-private/${inst}/${studentId}/${homeworkId}/${id}.${type.ext}`;
  const metadata={institution:inst,student:studentId,homework:homeworkId,receipt:id};
  const item={submissionId:id,recordType:'m9-homework-media',institutionId:inst,studentId,homeworkId,objectKey:key,mime:body.mime,size:body.size,mediaStatus:'pending',uploadedBy:claims.sub,createdAt:nowIso()};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Put:{TableName:table('submissions'),Item:item,ConditionExpression:'attribute_not_exists(submissionId)'}}]}));}catch(e){conflict(e)}
  const uploadUrl=await mediaIO.signPut(bucket,key,body.mime,body.size,metadata);
  return {attachmentId:id,key:id,uploadUrl,expiresIn:300,headers:{'Content-Type':body.mime,'x-amz-meta-institution':inst,'x-amz-meta-student':studentId,'x-amz-meta-homework':homeworkId,'x-amz-meta-receipt':id}};
 }
 async function mediaFinish(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string,body:any){
  if(!mediaEnabled())throw httpError(503,'M9 media integration disabled');
  if(!isObject(body)||!allowFields(body,['key'])||!m9MediaId(body.key))throw httpError(400,'Invalid attachment ID');
  const {checks}=await mediaAccess(inst,claims,studentId,homeworkId);
  const receipt=await get('submissions',body.key);
  if(!receipt||receipt.recordType!=='m9-homework-media'||receipt.institutionId!==inst||receipt.studentId!==studentId||receipt.homeworkId!==homeworkId||receipt.uploadedBy!==claims.sub)throw httpError(403,'Attachment access denied');
  if(receipt.mediaStatus==='ready')return {attachmentId:receipt.submissionId,ready:true};
  if(receipt.mediaStatus!=='pending')throw httpError(409,'Invalid attachment state');
  let head:any;
  try{head=await mediaIO.head(mediaBucket(),receipt.objectKey);}catch{throw httpError(409,'Uploaded attachment not found');}
  if(head.ContentLength!==receipt.size||head.ContentType!==receipt.mime||head.Metadata?.institution!==inst||head.Metadata?.student!==studentId||head.Metadata?.homework!==homeworkId||head.Metadata?.receipt!==receipt.submissionId)throw httpError(409,'Uploaded attachment metadata mismatch');
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Update:{TableName:table('submissions'),Key:{submissionId:receipt.submissionId},UpdateExpression:'SET mediaStatus=:ready, verifiedAt=:now',ConditionExpression:'recordType=:type AND institutionId=:inst AND studentId=:student AND homeworkId=:homework AND mediaStatus=:pending AND uploadedBy=:actor',ExpressionAttributeValues:{':ready':'ready',':now':nowIso(),':type':'m9-homework-media',':inst':inst,':student':studentId,':homework':homeworkId,':pending':'pending',':actor':claims.sub}}}]}));}catch(e){conflict(e)}
  return {attachmentId:receipt.submissionId,ready:true};
 }
 async function mediaLinks(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string){
  if(!mediaEnabled())throw httpError(503,'M9 media integration disabled');
  await learner(inst,claims,studentId);await assignment(inst,studentId,homeworkId);
  const submission=await get('submissions',`SUBMISSION-${homeworkId}-${studentId}`);
  if(submission&&(submission.institutionId!==inst||submission.studentId!==studentId||submission.homeworkId!==homeworkId))throw httpError(403,'Submission access denied');
  return {records:await mediaDownloadRecords(inst,studentId,homeworkId,submission?.attachmentIds||[])};
 }
 async function staffMediaLinks(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string,studentId:string){
  if(!mediaEnabled())throw httpError(503,'M9 media integration disabled');
  await staff(inst,claims,classId);
  const h=await get('homework',homeworkId);
  if(!checkAssignment(inst,h)||h.classId!==classId)throw httpError(404,'Homework unavailable');
  const submission=await get('submissions',`SUBMISSION-${homeworkId}-${studentId}`);
  if(!submission||submission.institutionId!==inst||submission.studentId!==studentId||submission.homeworkId!==homeworkId||submission.status!=='submitted')throw httpError(404,'Submitted homework unavailable');
  return {records:await mediaDownloadRecords(inst,studentId,homeworkId,submission.attachmentIds||[])};
 }
 async function mediaDownloadRecords(inst:InstitutionId,studentId:string,homeworkId:string,ids:string[]){
  if(!Array.isArray(ids)||ids.length>4)throw httpError(409,'Invalid saved attachments');
  const records=[];
  for(const id of ids){
   if(!m9MediaId(id))throw httpError(409,'Invalid stored attachment ID');
   const receipt=await get('submissions',id);
   if(!receipt||receipt.recordType!=='m9-homework-media'||receipt.mediaStatus!=='ready'||receipt.institutionId!==inst||receipt.studentId!==studentId||receipt.homeworkId!==homeworkId)throw httpError(403,'Attachment access denied');
   records.push({id,mime:receipt.mime,size:receipt.size,url:await mediaIO.signGet(mediaBucket(),receipt.objectKey)});
  }
  return records;
 }
 async function saveSubmission(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string,body:any){
  if(!isObject(body)||!allowFields(body,['text','status','expectedVersion','attachmentIds'])||typeof body.text!=='string'||body.text.length>10000||!['draft','submitted'].includes(body.status)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0||!Array.isArray(body.attachmentIds))throw httpError(400,'Invalid submission');
  if(body.attachmentIds.length&&!mediaEnabled())throw httpError(503,'M9 media integration disabled');
  if(body.status==='submitted'&&!body.text.trim()&&!body.attachmentIds.length)throw httpError(400,'Enter a response or attach evidence before submitting');
  const {actor,checks}=await learner(inst,claims,studentId),{h,enrollmentCheck}=await assignment(inst,studentId,homeworkId);
  if(!isHomeworkReleased(h)||!isHomeworkOpenAt(h))throw httpError(409,'Homework is not currently open');
  const id=`SUBMISSION-${homeworkId}-${studentId}`;const old=await get('submissions',id);
  if(old&&(old.institutionId!==inst||old.studentId!==studentId||old.homeworkId!==homeworkId))throw httpError(403,'Submission access denied');
  if((old?.version||0)!==body.expectedVersion)throw httpError(409,'Submission changed. Refresh first');
  if(old?.reviewedAt)throw httpError(409,'Reviewed submission is locked');
  if(!Array.isArray(body.attachmentIds)||body.attachmentIds.some((x:any)=>!m9MediaId(x))||new Set(body.attachmentIds).size!==body.attachmentIds.length||body.attachmentIds.length>4)throw httpError(400,'Invalid attachment selection');
  const mediaChecks:any[]=[];const mimes:string[]=[];
  for(const mediaId of body.attachmentIds){
   const receipt=await get('submissions',mediaId);
   if(!receipt||receipt.recordType!=='m9-homework-media'||receipt.mediaStatus!=='ready'||receipt.institutionId!==inst||receipt.homeworkId!==homeworkId||receipt.studentId!==studentId)throw httpError(403,'Unverified attachment');
   mimes.push(receipt.mime);
   mediaChecks.push({ConditionCheck:{TableName:table('submissions'),Key:{submissionId:mediaId},ConditionExpression:'recordType=:type AND mediaStatus=:ready AND institutionId=:inst AND homeworkId=:homework AND studentId=:student',ExpressionAttributeValues:{':type':'m9-homework-media',':ready':'ready',':inst':inst,':homework':homeworkId,':student':studentId}}});
  }
  if(!validateM9MediaSelection(mimes))throw httpError(400,'Too many attachments of one type');
  const now=nowIso(),item={submissionId:id,institutionId:inst,homeworkId,classId:h.classId,studentId,text:body.text.trim(),attachmentIds:body.attachmentIds,status:body.status,version:body.expectedVersion+1,updatedAt:now,updatedBy:claims.sub,submittedAt:body.status==='submitted'?now:(old?.submittedAt||null),createdAt:old?.createdAt||now};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,enrollmentCheck,...mediaChecks,{ConditionCheck:{TableName:table('homework'),Key:{homeworkId},ConditionExpression:'institutionId=:inst AND classId=:class AND #status<>:archived AND (attribute_not_exists(releaseAt) OR releaseAt<=:now) AND dueAt>=:now',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':inst':inst,':class':h.classId,':archived':'archived',':now':now}}},{Put:{TableName:table('submissions'),Item:item,ConditionExpression:old?'#version=:expected AND attribute_not_exists(reviewedAt)':'attribute_not_exists(submissionId)',...(old?{ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':body.expectedVersion}}:{})}},{Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkSubmissionSaved',id),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
  return {record:publicSubmission(item)};
 }
 async function complete(inst:InstitutionId,claims:Claims,studentId:string,body:any){
  if(!isObject(body)||!allowFields(body,['homeworkId','completed'])||body.completed!==true||!assignmentId(body.homeworkId))throw httpError(400,'Invalid completion request');
  const {actor,checks}=await learner(inst,claims,studentId);
  const {h,enrollmentCheck}=await assignment(inst,studentId,body.homeworkId);
  if(!isHomeworkReleased(h)||!isHomeworkOpenAt(h))throw httpError(409,'Homework is not currently open');
  const id=`SUBMISSION-${body.homeworkId}-${studentId}`,old=await get('submissions',id);
  if(old&&(old.institutionId!==inst||old.studentId!==studentId||old.homeworkId!==body.homeworkId))throw httpError(403,'Submission access denied');
  if(old?.completed===true||old?.status==='submitted')return {saved:true};
  if(old?.reviewedAt)throw httpError(409,'Reviewed homework is locked');
  const now=nowIso(),item={...(old||{}),submissionId:id,institutionId:inst,homeworkId:body.homeworkId,classId:h.classId,studentId,text:old?.text||'',attachmentIds:old?.attachmentIds||[],status:old?.status||'draft',completed:true,version:(old?.version||0)+1,createdAt:old?.createdAt||now,updatedAt:now,updatedBy:claims.sub};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,enrollmentCheck,{ConditionCheck:{TableName:table('homework'),Key:{homeworkId:body.homeworkId},ConditionExpression:'institutionId=:inst AND #status<>:archived AND (attribute_not_exists(releaseAt) OR releaseAt<=:now) AND dueAt>=:now',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':inst':inst,':archived':'archived',':now':now}}},{Put:{TableName:table('submissions'),Item:item,ConditionExpression:old?'#version=:expected':'attribute_not_exists(submissionId)',...(old?{ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':old.version}}:{})}},{Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkCompleted',id),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
  return {saved:true};
 }
 async function teacherSubmissions(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string){
  await staff(inst,claims,classId);const h=await get('homework',homeworkId);
  if(!checkAssignment(inst,h)||h.classId!==classId)throw httpError(404,'Assignment unavailable');
  return {records:(await query('submissions','HomeworkSubmissionsIndex','homeworkId',homeworkId)).filter(s=>s.institutionId===inst&&s.status==='submitted').map(publicSubmission)};
 }
 async function feedback(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string,studentId:string,body:any){
  if(!isObject(body)||!allowFields(body,['feedback','expectedVersion'])||typeof body.feedback!=='string'||body.feedback.length>2000||!Number.isInteger(body.expectedVersion))throw httpError(400,'Invalid feedback');
  const {actor,checks}=await staff(inst,claims,classId),h=await get('homework',homeworkId);
  if(!checkAssignment(inst,h)||h.classId!==classId)throw httpError(404,'Assignment unavailable');
  const id=`SUBMISSION-${homeworkId}-${studentId}`,old=await get('submissions',id);
  if(!old||old.institutionId!==inst||old.studentId!==studentId||old.homeworkId!==homeworkId||old.status!=='submitted')throw httpError(404,'Submission not found');
  if(old.version!==body.expectedVersion)throw httpError(409,'Submission changed');
  const updated={...old,feedback:body.feedback.trim(),reviewedAt:nowIso(),reviewedBy:claims.sub,version:old.version+1};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Put:{TableName:table('submissions'),Item:updated,ConditionExpression:'#version=:expected AND institutionId=:inst AND #status=:submitted',ExpressionAttributeNames:{'#version':'version','#status':'status'},ExpressionAttributeValues:{':expected':old.version,':inst':inst,':submitted':'submitted'}}},{Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkFeedbackSaved',id),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
  return {saved:true};
 }
 // Teacher materials are private S3 objects with canonical submission receipts.
 // Only selected, independently verified receipts are exposed on a homework.
 // This does not create a DynamoDB table or access legacy PK/SK records.
 const materialBucket=()=>{
  const bucket=process.env.SADHANA_HOMEWORK_MEDIA_BUCKET;
  if(!bucket)throw httpError(503,'Private teacher material storage not configured');
  return bucket;
 };
 async function teacherAssignment(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string){
  const permission=await staff(inst,claims,classId);
  if(!assignmentId(homeworkId))throw httpError(400,'Invalid homework identifier');
  const h=await get('homework',homeworkId);
  if(!checkAssignment(inst,h)||h.classId!==classId)throw httpError(404,'Assignment unavailable');
  return {...permission,h};
 }
 async function beginTeacherMaterial(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string,body:any){
  if(!mediaEnabled())throw httpError(503,'Teacher homework materials disabled');
  if(!isObject(body)||!allowFields(body,['mime','size'])||!teacherMaterialType(body.mime,body.size))throw httpError(400,'Invalid material type or size');
  const {checks,h}=await teacherAssignment(inst,claims,classId,homeworkId);
  if(!isHomeworkOpenAt(h))throw httpError(409,'Assignment deadline passed');
  const id=`MATERIAL#${randomUUID()}`,ext=teacherMaterialExt(body.mime);
  const key=`teacher-materials/${inst}/${classId}/${homeworkId}/${id.slice(9)}.${ext}`;
  const metadata={institution:inst,class:classId,homework:homeworkId,receipt:id};
  const item={submissionId:id,recordType:'teacher-homework-material',institutionId:inst,classId,homeworkId,
   objectKey:key,mime:body.mime,size:body.size,mediaStatus:'pending',uploadedBy:claims.sub,createdAt:nowIso()};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Put:{TableName:table('submissions'),Item:item,ConditionExpression:'attribute_not_exists(submissionId)'}}]}));}catch(e){conflict(e)}
  return {key:id,uploadUrl:await mediaIO.signPut(materialBucket(),key,body.mime,body.size,metadata),
   headers:{'Content-Type':body.mime,'x-amz-meta-institution':inst,'x-amz-meta-class':classId,
    'x-amz-meta-homework':homeworkId,'x-amz-meta-receipt':id}};
 }
 async function finishTeacherMaterial(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string,body:any){
  if(!mediaEnabled())throw httpError(503,'Teacher homework materials disabled');
  if(!isObject(body)||!allowFields(body,['key'])||!teacherMaterialId(body.key))throw httpError(400,'Invalid material receipt');
  const {checks,h}=await teacherAssignment(inst,claims,classId,homeworkId);
  if(!isHomeworkOpenAt(h))throw httpError(409,'Assignment deadline passed');
  const receipt=await get('submissions',body.key);
  if(!receipt||receipt.recordType!=='teacher-homework-material'||receipt.institutionId!==inst||
     receipt.classId!==classId||receipt.homeworkId!==homeworkId||receipt.uploadedBy!==claims.sub)
   throw httpError(403,'Material receipt does not belong to this assignment');
  if(receipt.mediaStatus==='ready')return {record:{id:receipt.submissionId,mime:receipt.mime,size:receipt.size}};
  if(receipt.mediaStatus!=='pending')throw httpError(409,'Invalid material state');
  let head:any;
  try{head=await mediaIO.head(materialBucket(),receipt.objectKey)}catch{throw httpError(409,'Uploaded material not found')}
  if(!teacherMaterialType(head.ContentType,head.ContentLength)||head.ContentType!==receipt.mime||
     head.ContentLength!==receipt.size||head.Metadata?.institution!==inst||head.Metadata?.class!==classId||
     head.Metadata?.homework!==homeworkId||head.Metadata?.receipt!==receipt.submissionId)
   throw httpError(409,'Uploaded material metadata mismatch');
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,{Update:{TableName:table('submissions'),Key:{submissionId:receipt.submissionId},
   UpdateExpression:'SET mediaStatus=:ready, verifiedAt=:now',
   ConditionExpression:'recordType=:type AND mediaStatus=:pending AND uploadedBy=:actor AND institutionId=:inst AND classId=:class AND homeworkId=:homework',
   ExpressionAttributeValues:{':ready':'ready',':now':nowIso(),':type':'teacher-homework-material',':pending':'pending',
    ':actor':claims.sub,':inst':inst,':class':classId,':homework':homeworkId}}}]}));}catch(e){conflict(e)}
  return {record:{id:receipt.submissionId,mime:receipt.mime,size:receipt.size}};
 }
 async function selectTeacherMaterials(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string,body:any){
  if(!mediaEnabled())throw httpError(503,'Teacher homework materials disabled');
  if(!isObject(body)||!allowFields(body,['ids','expectedVersion'])||!Number.isSafeInteger(body.expectedVersion)||
     body.expectedVersion<1||!Array.isArray(body.ids)||body.ids.length>3||new Set(body.ids).size!==body.ids.length||
     body.ids.some((id:unknown)=>!teacherMaterialId(id)))throw httpError(400,'Invalid material selection');
  const {actor,checks,h}=await teacherAssignment(inst,claims,classId,homeworkId);
  if(!isHomeworkOpenAt(h))throw httpError(409,'Assignment deadline passed');
  if(h.version!==body.expectedVersion)throw httpError(409,'Assignment changed. Refresh first');
  const receiptChecks:any[]=[];
  for(const id of body.ids){
   const r=await get('submissions',id);
   if(!r||r.recordType!=='teacher-homework-material'||r.mediaStatus!=='ready'||r.institutionId!==inst||
      r.classId!==classId||r.homeworkId!==homeworkId||!teacherMaterialType(r.mime,r.size))
    throw httpError(403,'Unverified or unrelated material receipt');
   receiptChecks.push({ConditionCheck:{TableName:table('submissions'),Key:{submissionId:id},
    ConditionExpression:'recordType=:type AND mediaStatus=:ready AND institutionId=:inst AND classId=:class AND homeworkId=:homework',
    ExpressionAttributeValues:{':type':'teacher-homework-material',':ready':'ready',':inst':inst,':class':classId,':homework':homeworkId}}});
  }
  const updated={...h,materialIds:body.ids,version:h.version+1,updatedAt:nowIso(),updatedBy:claims.sub};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,...receiptChecks,
   {Put:{TableName:table('homework'),Item:updated,
    ConditionExpression:'#version=:version AND institutionId=:inst AND classId=:class AND #status<>:archived',
    ExpressionAttributeNames:{'#version':'version','#status':'status'},ExpressionAttributeValues:{':version':h.version,':inst':inst,':class':classId,':archived':'archived'}}},
   {Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkMaterialsChanged',homeworkId),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
  return {saved:true};
 }
 async function signedTeacherMaterials(inst:InstitutionId,h:any){
  const ids=h.materialIds||[];
  if(!Array.isArray(ids)||ids.length>3||ids.some((id:unknown)=>!teacherMaterialId(id)))throw httpError(409,'Saved materials need reconciliation');
  const records=[];
  for(const id of ids){
   const r=await get('submissions',id);
   if(!r||r.recordType!=='teacher-homework-material'||r.mediaStatus!=='ready'||r.institutionId!==inst||
      r.classId!==h.classId||r.homeworkId!==h.homeworkId||!teacherMaterialType(r.mime,r.size))
    throw httpError(409,'Saved material needs reconciliation');
   records.push({id,mime:r.mime,size:r.size,url:await mediaIO.signGet(materialBucket(),r.objectKey)});
  }
  return {records};
 }
 async function teacherMaterialLinks(inst:InstitutionId,claims:Claims,classId:string,homeworkId:string){
  if(!mediaEnabled())throw httpError(503,'Teacher homework materials disabled');
  const {h}=await teacherAssignment(inst,claims,classId,homeworkId);
  return signedTeacherMaterials(inst,h);
 }
 async function learnerMaterialLinks(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string){
  if(!mediaEnabled())throw httpError(503,'Teacher homework materials disabled');
  await learner(inst,claims,studentId);
  const {h}=await assignment(inst,studentId,homeworkId);
  if(!isHomeworkReleased(h))throw httpError(403,'Assignment not released');
  return signedTeacherMaterials(inst,h);
 }
 return {listClass,publish,edit,remove,learnerList,getSubmission,saveSubmission,complete,teacherSubmissions,feedback,mediaStart,mediaFinish,mediaLinks,staffMediaLinks,beginTeacherMaterial,finishTeacherMaterial,selectTeacherMaterials,teacherMaterialLinks,learnerMaterialLinks};
}
let singleton:ReturnType<typeof makeM9Homework>|undefined;
export function m9Homework(){return singleton??=makeM9Homework(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));}
