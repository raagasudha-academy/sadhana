/** Canonical, read-only account-to-student compatibility for GET /family-access/mine.
 * No PK/SK repository calls; never infers a guardian grant from family/name/email.
 * Candidates from GSIs are always re-read through consistent base-table reads.
 */
import {matchingCognitoPerson} from './finalAccessCore.mjs';

const error = (status, message) => Object.assign(new Error(message), {status});
const refusal = (message, status=503) => ({status, body:{error:message}});
const validInstitution = value => value==='raaga'||value==='sruti';
const validId = value => typeof value==='string' && /^[A-Za-z0-9_-]{4,150}$/.test(value);
const inInstitution = (row, institution) => Array.isArray(row?.institutionIds) && row.institutionIds.includes(institution);
const activePerson = (row, institution) => row?.status==='active' && inInstitution(row,institution) && validId(row.personId);
const rollNumber = (row, institution) => row.studentProfile?.rollNumbers?.[institution] || '';
// Global personTypes/student and institutionIds are not proof that a person is a
// student in *this* academy: a guardian may be registered only in the other one.
const studentMember = (row, institution) =>
  Object.prototype.hasOwnProperty.call(row?.studentProfile?.rollNumbers || {}, institution) &&
  typeof rollNumber(row, institution) === 'string' && rollNumber(row, institution).trim().length > 0;
const publicStudent = (student,kind,inst) => ({
  id:student.personId,
  name:student.displayName || [student.firstName,student.lastName].filter(Boolean).join(' '),
  rollNumber:rollNumber(student,inst),
  kind,
  // We only claim a child relationship after checking an independently
  // approved family link, and never claim a parent relationship by name.
  relationship:kind==='guardian'?'child':'unknown',
});

export async function finalLinkedStudents(institution, subject, reader) {
  if(!validInstitution(institution)) throw error(400,'Choose a valid institution.');
  if(!validId(subject)) throw error(401,'Verified account required.');
  const candidates=await reader.peopleForSubject(subject);
  const matched=matchingCognitoPerson(candidates,subject,institution);
  if(!matched) return {records:[]};
  // Never authorise from an eventually consistent CognitoIdentityIndex result.
  const actor=await reader.person(matched.personId);
  if(!activePerson(actor,institution) || actor.cognitoSub!==subject)
    throw error(403,'Verified academy identity required.');
  const records=new Map();
  if(actor.personTypes?.includes('student') && studentMember(actor,institution))
    records.set(actor.personId,publicStudent(actor,'student',institution));
  if(actor.personTypes?.includes('guardian')) {
    const links=await reader.linksForGuardian(actor.personId);
    if(links.length>100) throw error(413,'Too many family links; administrator review required.');
    for(const candidate of links) {
      if(!validId(candidate?.linkId) || !validId(candidate?.studentId) ||
         candidate.guardianPersonId!==actor.personId || candidate.institutionId!==institution) continue;
      const link=await reader.link(candidate.linkId);
      if(!link || link.linkId!==candidate.linkId ||
         link.guardianPersonId!==actor.personId || link.studentId!==candidate.studentId ||
         link.institutionId!==institution || link.accessStatus!=='approved' ||
         link.relationshipVerified!==true || !validId(link.familyId)) continue;
      const student=await reader.person(link.studentId);
      if(!activePerson(student,institution)||!student.personTypes?.includes('student')||!studentMember(student,institution)||
         student.familyId!==link.familyId || actor.familyId!==link.familyId) continue;
      if(!records.has(student.personId)) records.set(student.personId,publicStudent(student,'guardian',institution));
    }
  }
  return {records:[...records.values()]};
}

export async function finalFamilyAccessRoute(context, deps, env=process.env) {
  if(env.SADHANA_ENTITY_TABLE_SET!=='final') return undefined;
  const {parts,method,claims,query={}}=context;
  if(!Array.isArray(parts)||parts[0]!=='family-access'||parts[1]!=='mine')return undefined;
  if(parts.length!==2||method!=='GET')return refusal('Unsupported linked-student operation.',405);
  if(!claims?.sub)return refusal('Authenticated account required.',401);
  if(env.SADHANA_DATA_MODE==='split'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled')
    return refusal('Final-table cutover has not been authorised.');
  if(env.SADHANA_FINAL_FAMILY_READS!=='enabled')return refusal('Final linked-student reads are disabled.');
  const inst=query.institution??context.inst;
  if(!validInstitution(inst))return refusal('Choose a valid institution.',400);
  deps.assertConfigured();
  return {status:200,body:await finalLinkedStudents(inst,claims.sub,deps.reader())};
}
