import {readPracticeComments} from './practiceFeedback.ts';
/** Learner-only endpoints backed by individually approved account/student links. */
import {randomUUID} from 'node:crypto';
import {GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {httpError} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {isStudentRecordId} from './accessRules.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing table');return process.env.SADHANA_TABLE_NAME};
const validInst=(x:string):InstitutionId=>{if(x!=='sruti'&&x!=='raaga')throw httpError(400,'Choose an academy');return x};
const dateOK=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().startsWith(x);
const ukToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const records=async(pk:string,limit=1000)=>{let cursor:any;const items:any[]=[];do{const result=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':pk},Limit:100,ExclusiveStartKey:cursor,ConsistentRead:true}));items.push(...(result.Items||[]));cursor=result.LastEvaluatedKey;if(items.length>limit)throw httpError(413,'Too many records')}while(cursor);return items};
async function authorised(inst:InstitutionId,claims:Claims,studentId:string){
 if(!claims.sub||!isStudentRecordId(studentId))throw httpError(403,'Student access denied');
 const r=(await db.send(new GetCommand({TableName:table(),Key:{PK:`ACCESS#${inst}#${claims.sub}`,SK:`STUDENT#${studentId}`},ConsistentRead:true}))).Item;
 if(!r||r.status!=='approved'||r.studentId!==studentId||r.institution!==inst)throw httpError(403,'Student access not approved');
 const student=(await db.send(new GetCommand({TableName:table(),Key:{PK:'OPS#GLOBAL#STUDENT',SK:`ITEM#${studentId}`},ConsistentRead:true}))).Item;
 if(!student||student.archived)throw httpError(404,'Active student record not found');
 return student;
}
async function enrolled(inst:InstitutionId,studentId:string){
 const all=await records(`OPS#${inst}#ENROLMENT`);
 return all.filter(e=>e.studentId===studentId&&!e.archived);
}
export async function learnerDashboard(instRaw:string,claims:Claims,studentId:string){
 const inst=validInst(instRaw);const student=await authorised(inst,claims,studentId);
 const memberships=await enrolled(inst,studentId);
 const currentClasses=await Promise.all(memberships.map(async e=>{
  const m=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(e.classId)}}))).Item;
  return {classId:e.classId,className:m?.name||'Class',startDate:e.startDate,endDate:e.endDate||''};
 }));
 const [practice,attendance,schedule,rsvps]=await Promise.all([records(`OPS#${inst}#PRACTICE`),records(`OPS#${inst}#ATTENDANCE`),records(schedulePK(inst)),records(`OPS#${inst}#RSVP`)]);
 const ownPractice=await Promise.all(practice.filter(p=>p.studentId===studentId).map(async p=>({id:p.id,classId:p.classId,date:p.date,minutes:p.minutes,topic:p.topic||'',comments:p.comments||'',version:p.version,teacherComments:await readPracticeComments(inst,p.id)})));
 const classNames=new Map(currentClasses.map(c=>[c.classId,c.className]));
 const ownAttendance=attendance.filter(a=>a.studentId===studentId);
 const marks=await Promise.all(ownAttendance.map(async a=>{
  const session=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(a.sessionId)}}))).Item;
  const allowed=!!session&&session.recordType==='class-session'&&memberships.some(e=>e.classId===session.classId&&e.startDate<=session.date&&(!e.endDate||session.date<=e.endDate));
  // Never expose unrelated session information merely because a record references its ID.
  return {sessionId:a.sessionId,status:a.status,date:allowed?session.date:'',className:allowed?(classNames.get(session.classId)||'Class'):'',classId:allowed?session.classId:''};
 }));
 marks.sort((a,b)=>b.date.localeCompare(a.date)||a.sessionId.localeCompare(b.sessionId));
 const byClass=Array.from(classNames.entries()).map(([classId,className])=>{
  const own=marks.filter(m=>m.classId===classId),countedMarks=own.filter(m=>['present','late','absent'].includes(m.status));
  const attendedMarks=countedMarks.filter(m=>m.status==='present'||m.status==='late').length;
  return {classId,className,recorded:own.length,attended:attendedMarks,counted:countedMarks.length,percent:countedMarks.length?Math.round(100*attendedMarks/countedMarks.length):null};
 });
 const counted=marks.filter(a=>['present','late','absent'].includes(a.status));
 const attended=counted.filter(a=>a.status==='present'||a.status==='late').length;
 const nextSessions=schedule.filter(s=>s.recordType==='class-session'&&typeof s.date==='string'&&s.date>=ukToday()&&memberships.some(e=>e.classId===s.classId&&e.startDate<=s.date&&(!e.endDate||s.date<=e.endDate))).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.startTime||'').localeCompare(String(b.startTime||''))).slice(0,5).map(s=>({sessionId:s.id,classId:s.classId,className:classNames.get(s.classId)||'Class',date:s.date,startTime:s.startTime||'',intention:rsvps.find(r=>r.studentId===studentId&&r.sessionId===s.id)?.intention||'unknown'}));
 return {student:{id:student.id,name:student.name,rollNumber:student.rollNumber||''},classes:currentClasses,nextSessions,practice:ownPractice,attendance:{marks,byClass,attended,counted:counted.length,percent:counted.length?Math.round(100*attended/counted.length):null}};
}
export async function saveLearnerPractice(instRaw:string,claims:Claims,studentId:string,body:any,practiceId?:string){
 const inst=validInst(instRaw);await authorised(inst,claims,studentId);
 const allowed=['classId','date','minutes','topic','comments','expectedVersion'];
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))throw httpError(400,'Unexpected practice data');
 const {classId,date,minutes,topic,comments,expectedVersion}=body;
 if(typeof classId!=='string'||!/^CLASS-[a-z0-9-]+$/i.test(classId)||!dateOK(date)||date>ukToday()||!Number.isInteger(minutes)||minutes<1||minutes>1440||typeof topic!=='string'||!topic.trim()||topic.length>200||typeof comments!=='string'||comments.length>1500)throw httpError(400,'Enter date, class, duration, topic and notes');
 const memberships=await enrolled(inst,studentId);
 if(!memberships.some(e=>e.classId===classId&&e.startDate<=date&&(!e.endDate||date<=e.endDate)))throw httpError(403,'Student was not enrolled in this class on that date');
 const existing=await records(`OPS#${inst}#PRACTICE`);
 const old=practiceId?existing.find(p=>p.id===practiceId&&p.studentId===studentId):null;
 if(practiceId&&!old)throw httpError(404,'Your practice entry was not found');
 if(old&&(!Number.isInteger(expectedVersion)||old.version!==expectedVersion))throw httpError(409,'Practice changed; refresh before editing');
 if(old&&old.date<ukToday())throw httpError(409,'Practice date has passed; corrections are locked');
 if(old&&(await readPracticeComments(inst,old.id)).length)throw httpError(409,'Teacher has reviewed this practice; corrections are locked');
 if(old&&(old.date!==date||old.classId!==classId))throw httpError(409,'Date/class cannot be changed on an existing entry');
 if(existing.some(p=>p.id!==practiceId&&p.studentId===studentId&&p.classId===classId&&p.date===date))throw httpError(409,'Practice already recorded for this class and date');
 const now=new Date().toISOString(),id=old?.id||`PRACTICE-${randomUUID()}`;
 const item={PK:`OPS#${inst}#PRACTICE`,SK:`ITEM#${id}`,id,institution:inst,studentId,classId,date,didPractice:true,minutes,topic:topic.trim(),comments:comments.trim(),createdAt:old?.createdAt||now,updatedAt:now,updatedBy:claims.sub,version:(old?.version||0)+1};
 const audit={PK:`AUDIT#${inst}`,SK:`STUDENT-PRACTICE#${now}#${randomUUID()}`,entityType:'audit',action:old?'studentPracticeEdit':'studentPracticeCreate',studentId,practiceId:id,actor:claims.sub,at:now,...(old?{previous:{minutes:old.minutes,topic:old.topic||'',comments:old.comments||''}}:{})};
 try{await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,...(old?{ConditionExpression:'#v=:expected',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':expected':old.version}}:{ConditionExpression:'attribute_not_exists(PK)'})}},{Put:{TableName:table(),Item:audit,ConditionExpression:'attribute_not_exists(PK)'}}]}))}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Practice was changed. Refresh and retry');throw e}
 return {record:{id,studentId,classId,date,minutes,topic:item.topic,comments:item.comments,version:item.version}};
}

/** A learner can RSVP only for their own approved, enrolled, future session. */
export async function saveLearnerRsvp(instRaw:string,claims:Claims,studentId:string,body:any){
 const inst=validInst(instRaw);await authorised(inst,claims,studentId);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['sessionId','intention'].includes(k)))throw httpError(400,'Unexpected RSVP data');
 const {sessionId,intention}=body;
 if(typeof sessionId!=='string'||!/^[-a-zA-Z0-9]+$/.test(sessionId)||!['attending','not_attending','unknown'].includes(intention))throw httpError(400,'Choose a valid class and response');
 const session=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(sessionId)},ConsistentRead:true}))).Item;
 if(!session||session.recordType!=='class-session'||!dateOK(session.date)||session.date<ukToday())throw httpError(409,'RSVP is only available for upcoming classes');
 if(session.date===ukToday()&&session.startTime&&/^[0-2]\d:[0-5]\d/.test(session.startTime)){
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  if(clock>=session.startTime.slice(0,5))throw httpError(409,'The class has started; RSVP is closed');
 }
 const memberships=await enrolled(inst,studentId);
 if(!memberships.some(e=>e.classId===session.classId&&e.startDate<=session.date&&(!e.endDate||session.date<=e.endDate)))throw httpError(403,'Student is not enrolled in this session');
 const existing=(await records(`OPS#${inst}#RSVP`)).find(r=>r.studentId===studentId&&r.sessionId===sessionId);
 const now=new Date().toISOString(),id=existing?.id||`RSVP-${randomUUID()}`;
 const item={PK:`OPS#${inst}#RSVP`,SK:`ITEM#${id}`,id,institution:inst,studentId,sessionId,intention,note:'',version:(existing?.version||0)+1,createdAt:existing?.createdAt||now,updatedAt:now,updatedBy:claims.sub};
 const audit={PK:`AUDIT#${inst}`,SK:`LEARNER-RSVP#${now}#${randomUUID()}`,entityType:'audit',action:'learnerRSVP',actor:claims.sub,studentId,sessionId,intention,at:now};
 try{await db.send(new TransactWriteCommand({TransactItems:[{Put:{TableName:table(),Item:item,...(existing?{ConditionExpression:'#v=:expected',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':expected':existing.version}}:{ConditionExpression:'attribute_not_exists(PK)'})}},{Put:{TableName:table(),Item:audit}}]}));}
 catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'RSVP changed; refresh and retry');throw e}
 return {record:{id,studentId,sessionId,intention,version:item.version}};
}
