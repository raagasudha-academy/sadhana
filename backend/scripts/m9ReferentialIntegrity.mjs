/** Pure M9 target-record referential validation. No AWS access or writes. */
const table=(suffix)=>`sadhana-dev-${suffix}`;
const text=(x)=>typeof x==='string'&&x.trim().length>0;
const issue=(severity,code,kind,id,detail)=>({severity,code,kind,id,detail});
export function validateM9References(rows,{requireInstitutionRows=false}={}){
 const blockers=[],warnings=[],counts={};
 const indexed=new Map();
 for(const record of rows){
  const name=record.tableName,item=record.item??{};
  counts[name]=(counts[name]??0)+1;
  if(!indexed.has(name))indexed.set(name,new Map());
  const keyName={
    [table('institutions')]:'institutionId',[table('people')]:'personId',
    [table('families')]:'familyId',[table('family-links')]:'linkId',
    [table('classes')]:'classId',[table('venues')]:'venueId',
    [table('enrolments')]:'enrolmentId',[table('sessions')]:'sessionId',
    [table('attendance')]:'attendanceId',[table('practice')]:'practiceId',
    [table('homework')]:'homeworkId',[table('submissions')]:'submissionId',
    [table('events')]:'eventId',[table('rsvps')]:'rsvpId',
    [table('registrations')]:'registrationId',[table('notifications')]:'notificationId',
    [table('audit')]:'auditId',[table('counters')]:'counterId'
  }[name];
  if(!keyName){blockers.push(issue('BLOCKER','UNKNOWN_TABLE',name,null,'Unknown destination table'));continue;}
  const key=item[keyName];
  if(!text(key)){blockers.push(issue('BLOCKER','MISSING_PK',name,null,keyName));continue;}
  const map=indexed.get(name);
  if(map.has(key))blockers.push(issue('BLOCKER','DUPLICATE_PK',name,key,'Duplicated destination key'));
  else map.set(key,item);
 }
 const get=(suffix,id)=>indexed.get(table(suffix))?.get(id);
 const targets=(suffix)=>[...(indexed.get(table(suffix))?.values()??[])];
 function ref(item,kind,idField,targetSuffix,{allowMissing=false}={}){
  const id=item[idField];if(!text(id))return;
  if(!get(targetSuffix,id)){
   const place=item.sessionId??item.classId??item.eventId??item.enrolmentId??item.personId??null;
   const out=issue(allowMissing?'WARNING':'BLOCKER',`MISSING_${targetSuffix.toUpperCase().replaceAll('-','_')}`,kind,place,`${idField}=${id}`);
   (allowMissing?warnings:blockers).push(out);
  }
 }
 function institution(item,kind){
  if(!text(item.institutionId)){blockers.push(issue('BLOCKER','MISSING_INSTITUTION',kind,item.classId??item.sessionId??item.eventId??null,'institutionId missing'));return;}
  if(requireInstitutionRows)ref(item,kind,'institutionId','institutions');
 }
 for(const c of targets('classes')){
  institution(c,'class');
  ref(c,'class','defaultVenueId','venues');
  for(const id of c.teacherPersonIds??[])ref({teacherPersonId:id},'class','teacherPersonId','people');
 }
 for(const s of targets('sessions')){
  institution(s,'session');
  if(s.recordType==='class-session'||s.recordType==='series-change'){
   if(!text(s.classId))blockers.push(issue('BLOCKER','MISSING_CLASS_ID','session',s.sessionId,'Class session/rule requires classId'));
   else ref(s,'session','classId','classes');
  }
  ref(s,'session','venueId','venues');
  for(const id of s.teacherPersonIds??[])ref({teacherPersonId:id},'session','teacherPersonId','people');
  if(s.recordType==='class-session'&&s.timeResolution!=='converted'&&s.timeResolution!=='all-day')blockers.push(issue('BLOCKER','UNRESOLVED_SESSION_TIME','session',s.sessionId,String(s.timeResolution)));
  if(s.recordType==='series-change'&&!text(s.effectiveFrom))blockers.push(issue('BLOCKER','INVALID_SERIES_EFFECTIVE_DATE','session',s.sessionId,'effectiveFrom missing'));
  const parent=get('classes',s.classId);
  if(parent&&parent.institutionId!==s.institutionId)blockers.push(issue('BLOCKER','CROSS_INSTITUTION_CLASS','session',s.sessionId,`${s.institutionId} -> ${parent.institutionId}`));
 }
 for(const e of targets('events')){
  institution(e,'event');ref(e,'event','venueId','venues');
  if(e.timeResolution!=='converted'&&e.timeResolution!=='all-day')blockers.push(issue('BLOCKER','UNRESOLVED_EVENT_TIME','event',e.eventId,String(e.timeResolution)));
 }
 for(const e of targets('enrolments')){
  institution(e,'enrolment');ref(e,'enrolment','studentId','people');ref(e,'enrolment','classId','classes');
 }
 for(const a of targets('attendance')){institution(a,'attendance');ref(a,'attendance','studentId','people');ref(a,'attendance','sessionId','sessions');}
 for(const p of targets('practice')){institution(p,'practice');ref(p,'practice','studentId','people');ref(p,'practice','classId','classes');}
 for(const h of targets('homework')){institution(h,'homework');ref(h,'homework','classId','classes');ref(h,'homework','teacherPersonId','people');}
 for(const s of targets('submissions')){institution(s,'submission');ref(s,'submission','studentId','people');ref(s,'submission','homeworkId','homework');}
 for(const l of targets('family-links')){ref(l,'family-link','familyId','families');ref(l,'family-link','personId','people');ref(l,'family-link','guardianPersonId','people');ref(l,'family-link','studentId','people');}
 for(const r of targets('rsvps')){institution(r,'rsvp');ref(r,'rsvp','studentId','people');if(r.eventId)ref(r,'rsvp','eventId','events');if(r.sessionId)ref(r,'rsvp','sessionId','sessions');}
 for(const p of targets('people')){
  if(p.cognitoSub&&!text(p.cognitoSub))blockers.push(issue('BLOCKER','INVALID_COGNITO_SUB','person',p.personId,'Bad Cognito subject'));
 }
 const cognitoSeen=new Map();for(const p of targets('people'))if(text(p.cognitoSub)){
  if(cognitoSeen.has(p.cognitoSub))blockers.push(issue('BLOCKER','DUPLICATE_COGNITO_SUB','person',p.personId,'Cognito identity claimed by multiple people'));
  cognitoSeen.set(p.cognitoSub,p.personId);
 }
 // Audit contains historic, deliberately deleted student references; do not validate those as live references.
 // Source inventory has no institution records; those must be provisioned before cutover, but
 // the absence is not a migration blocker unless caller explicitly requests full target validation.
 if(!requireInstitutionRows&&targets('institutions').length===0)warnings.push(issue('WARNING','INSTITUTIONS_NOT_SEEDED','institutions',null,'Institution configuration is a cutover dependency, not part of the 642-record source migration'));
 const codeCounts=(list)=>Object.fromEntries([...new Set(list.map(i=>i.code))].sort().map(c=>[c,list.filter(i=>i.code===c).length]));
 return {schema:1,readOnly:true,canExecute:false,recordsChecked:rows.length,tableCounts:counts,blockerCount:blockers.length,warningCount:warnings.length,blockerCodes:codeCounts(blockers),warningCodes:codeCounts(warnings),readyForIntegrationReview:blockers.length===0,blockers,warnings};
}
