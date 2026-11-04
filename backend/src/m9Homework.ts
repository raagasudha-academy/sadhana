/** Isolated M9 homework and submission storage. No legacy PK/SK reads or writes. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,permittedInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {matchingCognitoPerson,authorisedStudent} from './m9FinalAccessCore.mjs';
import {validateHomeworkSchedule,isHomeworkOpenAt,isHomeworkReleased} from './homeworkPublishingPolicy.ts';

export type HomeworkDB={send:(command:any)=>Promise<any>};
const table=(entity:string)=>`sadhana-dev-m9-${entity}`;
const assignmentId=(v:unknown)=>typeof v==='string'&&/^HOMEWORK-[0-9a-f-]{36}$/i.test(v);
const acceptableId=(v:unknown)=>typeof v==='string'&&/^[-a-zA-Z0-9_]{4,150}$/.test(v);
const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const allowFields=(v:Record<string,any>,fields:string[])=>Object.keys(v).every(k=>fields.includes(k));
const conflict=(e:any)=>{if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))throw httpError(409,'Record or access changed. Refresh and retry.');throw e;};
const publicHomework=(h:any)=>({id:h.homeworkId,classId:h.classId,title:h.title,instructions:h.instructions,dueDate:h.dueDate,dueTime:h.dueTime||'23:59',dueAt:h.dueAt||null,releaseAt:h.releaseAt||null,gradingEnabled:h.gradingEnabled===true,createdAt:h.createdAt,materialIds:h.materialIds||[],version:h.version||1});
const publicSubmission=(s:any)=>({studentId:s.studentId,homeworkId:s.homeworkId,text:s.text||'',attachmentIds:s.attachmentIds||[],status:s.status,version:s.version||0,updatedAt:s.updatedAt||'',submittedAt:s.submittedAt||null,feedback:s.feedback||'',reviewedAt:s.reviewedAt||null});
const nowIso=()=>new Date().toISOString();
export function makeM9Homework(db:HomeworkDB){
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
 async function saveSubmission(inst:InstitutionId,claims:Claims,studentId:string,homeworkId:string,body:any){
  if(!isObject(body)||!allowFields(body,['text','status','expectedVersion','attachmentIds'])||typeof body.text!=='string'||body.text.length>10000||!['draft','submitted'].includes(body.status)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0||!Array.isArray(body.attachmentIds))throw httpError(400,'Invalid submission');
  // Media metadata is a separate migration. Never accept unverified legacy attachment references.
  if(body.attachmentIds.length)throw httpError(503,'M9 evidence uploads are not yet available');
  if(body.status==='submitted'&&!body.text.trim())throw httpError(400,'Enter a response before submitting');
  const {actor,checks}=await learner(inst,claims,studentId),{h,enrollmentCheck}=await assignment(inst,studentId,homeworkId);
  if(!isHomeworkReleased(h)||!isHomeworkOpenAt(h))throw httpError(409,'Homework is not currently open');
  const id=`SUBMISSION-${homeworkId}-${studentId}`;const old=await get('submissions',id);
  if(old&&(old.institutionId!==inst||old.studentId!==studentId||old.homeworkId!==homeworkId))throw httpError(403,'Submission access denied');
  if((old?.version||0)!==body.expectedVersion)throw httpError(409,'Submission changed. Refresh first');
  if(old?.reviewedAt)throw httpError(409,'Reviewed submission is locked');
  const now=nowIso(),item={submissionId:id,institutionId:inst,homeworkId,classId:h.classId,studentId,text:body.text.trim(),attachmentIds:[],status:body.status,version:body.expectedVersion+1,updatedAt:now,updatedBy:claims.sub,submittedAt:body.status==='submitted'?now:(old?.submittedAt||null),createdAt:old?.createdAt||now};
  try{await db.send(new TransactWriteCommand({TransactItems:[...checks,enrollmentCheck,{ConditionCheck:{TableName:table('homework'),Key:{homeworkId},ConditionExpression:'institutionId=:inst AND classId=:class AND #status<>:archived AND (attribute_not_exists(releaseAt) OR releaseAt<=:now) AND dueAt>=:now',ExpressionAttributeNames:{'#status':'status'},ExpressionAttributeValues:{':inst':inst,':class':h.classId,':archived':'archived',':now':now}}},{Put:{TableName:table('submissions'),Item:item,ConditionExpression:old?'#version=:expected AND attribute_not_exists(reviewedAt)':'attribute_not_exists(submissionId)',...(old?{ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':expected':body.expectedVersion}}:{})}},{Put:{TableName:table('audit'),Item:audit(inst,claims,actor,'homeworkSubmissionSaved',id),ConditionExpression:'attribute_not_exists(auditId)'}}]}));}catch(e){conflict(e)}
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
 return {listClass,publish,edit,learnerList,getSubmission,saveSubmission,complete,teacherSubmissions,feedback};
}
let singleton:ReturnType<typeof makeM9Homework>|undefined;
export function m9Homework(){return singleton??=makeM9Homework(DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}));}
