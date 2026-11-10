/** Pure M9 learner authorization and projection helpers; no legacy PK/SK access. */
const deny=(code,message)=>{throw Object.assign(new Error(message),{status:code});};
export function matchingCognitoPerson(rows,subject,institution){
 if(typeof subject!=='string'||!subject)return null;
 const exact=rows.filter(p=>p.cognitoSub===subject && p.status==='active' && Array.isArray(p.institutionIds)&&p.institutionIds.includes(institution));
 if(exact.length>1)deny(409,'Ambiguous Cognito identity; administrator review required.');
 return exact[0]??null;
}
export function authorisedStudent(actor,student,links,institution){
 if(!actor||!student||student.status!=='active'||!student.personTypes?.includes('student')||!student.institutionIds?.includes(institution))deny(403,'Approved student access required.');
 // A person may be a guardian in this academy and a learner in another.
 // Self-access requires an academy-specific student membership, not global roles.
 if(actor.personId===student.personId && actor.personTypes?.includes('student') &&
    typeof student.studentProfile?.rollNumbers?.[institution]==='string' &&
    student.studentProfile.rollNumbers[institution].trim())return {kind:'self',studentId:student.personId};
 const matches=links.filter(x=>x.guardianPersonId===actor.personId && x.studentId===student.personId && x.institutionId===institution && x.accessStatus==='approved' && x.relationshipVerified===true);
 if(matches.length!==1)deny(403,'Independently verified guardian access required.');
 return {kind:'guardian',studentId:student.personId};
}
export function projectLearnerDashboard(student,enrolments,classes,sessions,practice,attendance,rsvps,referenceDate,institution=student.institutionIds?.[0]){
 const name=student.displayName||[student.firstName,student.lastName].filter(Boolean).join(' ');
 const active=enrolments.filter(x=>x.studentId===student.personId && x.status==='active');
 const byClass=new Map(classes.filter(x=>active.some(e=>e.classId===x.classId)).map(x=>[x.classId,x]));
 const cls=active.map(x=>({classId:x.classId,className:byClass.get(x.classId)?.name||byClass.get(x.classId)?.legacyPayload?.name||'Class',startDate:x.startDate||'',endDate:x.endDate||''}));
 const cName=new Map(cls.map(x=>[x.classId,x.className]));
 const allowed=(session)=>active.some(x=>x.classId===session.classId && (!x.startDate||x.startDate<=session.date) && (!x.endDate||session.date<=x.endDate));
 const calendarSessions=sessions.filter(s=>s.recordType==='class-session'&&typeof s.date==='string'&&allowed(s))
  .sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||'').localeCompare(String(b.startTime||'')))
  .map(s=>({sessionId:s.sessionId,classId:s.classId,className:cName.get(s.classId)||'Class',date:s.date,startTime:s.startTime||'',additionalSession:s.additionalSession===true,status:s.status||'confirmed',intention:rsvps.find(r=>r.studentId===student.personId&&r.sessionId===s.sessionId)?.intention||'unknown'}));
 const visibleSession=new Map(calendarSessions.map(s=>[s.sessionId,s]));
 const marks=attendance.filter(x=>x.studentId===student.personId).map(x=>{
  const session=visibleSession.get(x.sessionId);
  return {sessionId:x.sessionId,status:x.status,date:session?.date||'',className:session?.className||'',classId:session?.classId||''};
 }).sort((a,b)=>b.date.localeCompare(a.date)||a.sessionId.localeCompare(b.sessionId));
 const countedMarks=marks.filter(x=>['present','late','absent'].includes(x.status));
 const attended=countedMarks.filter(x=>x.status==='present'||x.status==='late').length;
 const byClassStats=cls.map(c=>{
  const own=marks.filter(m=>m.classId===c.classId),counted=own.filter(m=>['present','late','absent'].includes(m.status));
  const hits=counted.filter(m=>m.status==='present'||m.status==='late').length;
  return {classId:c.classId,className:c.className,recorded:own.length,attended:hits,counted:counted.length,percent:counted.length?Math.round(100*hits/counted.length):null};
 });
 const activity=practice.filter(p=>p.recordType!=='operational-feedback'&&p.studentId===student.personId).map(p=>({id:p.practiceId,classId:p.classId,date:p.practiceDate,minutes:p.minutes,topic:p.topic||'',comments:p.comments||'',version:p.version||1,teacherComments:(Array.isArray(p.teacherComments)?p.teacherComments:[]).map(c=>({id:c.id,comment:c.comment,createdAt:c.createdAt}))}));
 return {student:{id:student.personId,name,rollNumber:student.studentProfile?.rollNumbers?.[institution]||''},classes:cls,nextSessions:calendarSessions.filter(s=>s.date>=referenceDate).slice(0,5),calendarSessions,practice:activity,attendance:{marks,byClass:byClassStats,attended,counted:countedMarks.length,percent:countedMarks.length?Math.round(100*attended/countedMarks.length):null}};
}
export function buildReadinessReport(input){
 const {counts,requiredTables,actualTables,checks={}}=input;
 const problems=[];
 const operational={classes:22,sessions:423,events:6,venues:3,people:7,institutions:2};
 for(const name of requiredTables)if(!actualTables.includes(name))problems.push('MISSING_TABLE:'+name);
 for(const [entity,min] of Object.entries(operational))if((counts[entity]??0)<min)problems.push('INSUFFICIENT_'+entity.toUpperCase());
 for(const [key,value] of Object.entries(checks))if(value!==true)problems.push('UNVERIFIED_'+key.toUpperCase());
 return {schema:1,readOnly:true,canExecute:false,checks,tableCount:actualTables.length,counts,blockers:problems,blockerCount:problems.length,fullCutoverReady:problems.length===0};
}
