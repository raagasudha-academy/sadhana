/** Existing learner-profile/directory endpoints on canonical entities.
 * This module contains no DynamoDB/legacy PK/SK access; IO is injected.
 * Enabling these endpoints requires confirmed migration parity for the old
 * PROFILE#studentId records. Permission is always rechecked on writes.
 */
import {matchingCognitoPerson,authorisedStudent} from './m9FinalAccessCore.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const idOk=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{4,150}$/.test(value);
const instOk=value=>value==='raaga'||value==='sruti';
const active=(person,inst)=>person?.status==='active'&&person.institutionIds?.includes(inst);
const profile=(student)=>{
 const raw=student?.learnerPreferences;
 if(raw!==undefined && (typeof raw!=='object'||Array.isArray(raw)||!Number.isSafeInteger(raw.version)||raw.version<1||
    !['preferredName','phone','about'].every(k=>typeof raw[k]==='string')))
  fail(409,'Student preferences require migration review.');
 return {preferredName:raw?.preferredName||'',phone:raw?.phone||'',about:raw?.about||'',version:raw?.version||0};
};
export function validateLearnerPreferences(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='about,expectedVersion,phone,preferredName')
  fail(400,'Unsupported profile fields.');
 const {preferredName,phone,about,expectedVersion}=body;
 if(typeof preferredName!=='string'||preferredName.length>80||/[<>]/.test(preferredName)||
    typeof phone!=='string'||phone.length>30||!/^[+\d ()-]*$/.test(phone)||
    typeof about!=='string'||about.length>500||
    !Number.isSafeInteger(expectedVersion)||expectedVersion<0)
  fail(400,'Invalid profile details.');
 return {preferredName:preferredName.trim(),phone:phone.trim(),about:about.trim(),expectedVersion};
}
const displayName=p=>String(p?.displayName||[p?.firstName,p?.lastName].filter(Boolean).join(' ')).trim();
const roll=(student,inst)=>student.studentProfile?.rollNumbers?.[inst]||'';

export function makeM10FinalLearnerProfiles(io){
 async function authorised(inst,claims,studentId){
  if(!instOk(inst)||!idOk(studentId))fail(400,'Invalid student or institution.');
  if(!idOk(claims?.sub))fail(401,'Authenticated account required.');
  const match=matchingCognitoPerson(await io.identities(claims.sub),claims.sub,inst);
  if(!match||!idOk(match.personId))fail(403,'Verified academy identity required.');
  const actor=await io.person(match.personId);
  if(!active(actor,inst)||actor.cognitoSub!==claims.sub)fail(403,'Verified academy identity required.');
  const student=await io.person(studentId);
  let links=[];
  if(actor.personId!==studentId){
   if(!actor.personTypes?.includes('guardian'))fail(403,'Guardian access required.');
   const candidates=await io.guardianCandidates(actor.personId);
   if(candidates.length>100)fail(413,'Too many guardian links.');
   const possible=candidates.filter(x=>idOk(x.linkId)&&x.studentId===studentId&&x.institutionId===inst);
   links=(await Promise.all(possible.map(x=>io.link(x.linkId)))).filter(x=>
     x&&x.guardianPersonId===actor.personId&&x.studentId===studentId&&x.institutionId===inst&&
     x.accessStatus==='approved'&&x.relationshipVerified===true&&
     x.familyId&&x.familyId===actor.familyId&&x.familyId===student?.familyId);
  }
  authorisedStudent(actor,student,links,inst);
  return {actor,student,link:actor.personId===studentId?null:links[0]};
 }
 async function extras(inst,claims,studentId){
  const {student}=await authorised(inst,claims,studentId);
  const candidates=await io.enrolments(studentId);
  if(candidates.length>100)fail(413,'Too many enrolments.');
  // A revoked enrolment can linger on an eventually consistent GSI. Re-read
  // every candidate from the authoritative base row before showing a class.
  const enrs=(await Promise.all(candidates.filter(x=>idOk(x.enrolmentId)).map(x=>io.enrolment(x.enrolmentId))))
   .filter(x=>x&&x.studentId===studentId&&x.institutionId===inst&&x.status==='active');
  const classIds=[...new Set(enrs.map(x=>x.classId).filter(idOk))];
  const classes=[];
  for(const id of classIds){
   const cls=await io.class(id);
   if(!cls||cls.institutionId!==inst||['archived','inactive','deleted'].includes(cls.status))continue;
   let teacher=String(cls.legacyPayload?.teacher||'').trim();
   if(!teacher&&Array.isArray(cls.teacherPersonIds)&&cls.teacherPersonIds.length){
    const names=[];
    for(const pid of cls.teacherPersonIds.slice(0,10)){
     if(!idOk(pid))continue;
     const p=await io.person(pid);
     if(active(p,inst)&&p.personTypes?.includes('teacher'))names.push(displayName(p));
    }
    teacher=names.filter(Boolean).join(', ');
   }
   let venue=String(cls.legacyPayload?.location||cls.legacyPayload?.venue||'').trim();
   if(!venue&&idOk(cls.defaultVenueId)){
    const v=await io.venue(cls.defaultVenueId);
    if(v&&v.status!=='archived')venue=String(v.name||'').trim();
   }
   classes.push({classId:cls.classId,name:String(cls.name||cls.legacyPayload?.name||'Class'),teacher,venue});
  }
  return {student:{id:student.personId,name:displayName(student),rollNumber:roll(student,inst)},
   profile:profile(student),teachers:[...new Set(classes.map(x=>x.teacher).filter(Boolean))],
   venues:[...new Set(classes.map(x=>x.venue).filter(Boolean))],classes};
 }
 async function saveProfile(inst,claims,studentId,body){
  const input=validateLearnerPreferences(body);
  const {student,actor,link}=await authorised(inst,claims,studentId);
  if(profile(student).version!==input.expectedVersion)fail(409,'Profile changed. Refresh before saving.');
  if(!Number.isSafeInteger(student.version)||student.version<1)fail(409,'Student version requires review.');
  await io.writePreferences({inst,subject:claims.sub,student,actor,link,
   preferences:{preferredName:input.preferredName,phone:input.phone,about:input.about,version:input.expectedVersion+1},
   expectedVersion:input.expectedVersion});
  return {updated:true,version:input.expectedVersion+1};
 }
 async function academyDirectory(inst,claims,studentId){
  await authorised(inst,claims,studentId);
  return io.publicDirectory(inst);
 }
 return {extras,saveProfile,academyDirectory,authorise:authorised};
}
