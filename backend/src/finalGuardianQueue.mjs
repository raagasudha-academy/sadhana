/** Final-only guardian administrator queue. Neither a family match nor an
 * email/name match can create or approve an access link. All mutable decisions
 * remain the responsibility of the transactional M95 guardian service.
 */
const bad=(status,message)=>Object.assign(new Error(message),{status});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{4,150}$/.test(value);
const active=(person,inst)=>person?.status==='active'&&person.institutionIds?.includes(inst);
const statuses=new Set(['pending','approved','rejected','revoked']);

export async function finalGuardianQueue(inst,reader){
 if(!['raaga','sruti'].includes(inst))throw bad(400,'Choose an institution.');
 const candidates=await reader.links();
 if(!Array.isArray(candidates)||candidates.length>2000)throw bad(413,'Guardian queue exceeds safe review limit.');
 const records=[];const subs=new Set();const seen=new Set();let reconciliationRequired=0;
 for(const candidate of candidates){
  if(candidate.institutionId!==inst||candidate.recordType!=='guardian-access')continue;
  if(!validId(candidate.linkId)){reconciliationRequired++;continue;}
  if(seen.has(candidate.linkId))throw bad(409,'Duplicate guardian link needs administrator reconciliation.');
  seen.add(candidate.linkId);
  // A scan/index result must not be treated as authoritative. Re-read the key.
  const link=await reader.link(candidate.linkId);
  if(!link||link.linkId!==candidate.linkId||link.recordType!=='guardian-access'||link.institutionId!==inst||
     !validId(link.guardianPersonId)||!validId(link.studentId)||!validId(link.familyId)||
     !statuses.has(link.accessStatus)||!Number.isSafeInteger(link.version)||link.version<1)
  {reconciliationRequired++;continue;}
  const [guardian,student]=await Promise.all([reader.person(link.guardianPersonId),reader.person(link.studentId)]);
  if(!active(guardian,inst)||!active(student,inst)||
     guardian.personId!==link.guardianPersonId||student.personId!==link.studentId||
     (link.guardianFamilyId||link.familyId)!==guardian.familyId||student.familyId!==link.familyId||
     !guardian.personTypes?.includes('guardian')||!student.personTypes?.includes('student')||
     !validId(guardian.cognitoSub)){reconciliationRequired++;continue;}
  if(records.length>=200)throw bad(413,'Guardian queue exceeds safe review limit.');
  records.push({studentId:student.personId,subject:guardian.cognitoSub,kind:'guardian',status:link.accessStatus,version:link.version,
   ...(guardian.familyId!==student.familyId?{familyReviewRequired:true}:{})});
  subs.add(guardian.cognitoSub);
 }
 const identities={};
 // Directory lookups only affect DISPLAY. A missing/unverified Cognito identity
 // never becomes a verified identity simply because a canonical link exists.
 if(subs.size>100)throw bad(413,'Too many guardian identities for one review.');
 for(const sub of subs){
  try {const verified=await reader.verifiedIdentity(sub);if(verified?.verified===true)identities[sub]=verified;}
  catch { /* a Cognito failure must not create a verified identity */ }
 }
 records.sort((a,b)=>a.status.localeCompare(b.status)||a.studentId.localeCompare(b.studentId));
 return {records,identities,source:'final',reconciliationRequired};
}

export async function canonicalGuardianPersonForSubject(inst,subject,reader){
 if(!['raaga','sruti'].includes(inst)||!validId(subject))throw bad(400,'Invalid guardian account.');
 const indexed=await reader.peopleForSubject(subject);
 if(!Array.isArray(indexed)||indexed.length>2)throw bad(409,'Ambiguous guardian account.');
 const candidates=[];
 for(const item of indexed){
  if(item.cognitoSub!==subject||!validId(item.personId))continue;
  const fresh=await reader.person(item.personId);
  if(fresh?.cognitoSub===subject&&active(fresh,inst)&&fresh.personTypes?.includes('guardian'))candidates.push(fresh);
 }
 if(candidates.length!==1)throw bad(409,'Guardian account requires independent reconciliation.');
 return candidates[0].personId;
}

/** Candidates are derived from exact approved Raagasudha links, never name/email matching.
 * An existing Sruti pending/approved link is handled by the review queue instead. */
export async function finalSrutiGuardianCandidates(reader){
 const items=await reader.links();
 if(!Array.isArray(items)||items.length>2000)throw bad(413,'Guardian candidate limit exceeded.');
 const records=[],seen=new Set();
 for(const candidate of items){
  if(candidate.institutionId!=='raaga'||candidate.recordType!=='guardian-access'||candidate.accessStatus!=='approved')continue;
  if(!validId(candidate.linkId)||!validId(candidate.guardianPersonId)||!validId(candidate.studentId))continue;
  const pair=candidate.guardianPersonId+'|'+candidate.studentId;
  if(seen.has(pair))continue;seen.add(pair);
  const verified=await reader.link(candidate.linkId);
  if(!verified||verified.linkId!==candidate.linkId||verified.institutionId!=='raaga'||
     verified.guardianPersonId!==candidate.guardianPersonId||verified.studentId!==candidate.studentId||
     verified.accessStatus!=='approved'||verified.relationshipVerified!==true||
     !validId(verified.familyId))continue;
  const [guardian,student]=await Promise.all([reader.person(verified.guardianPersonId),reader.person(verified.studentId)]);
  if(!active(guardian,'sruti')||!active(student,'sruti')||
     guardian.familyId!==verified.familyId||student.familyId!==verified.familyId||
     !guardian.personTypes?.includes('guardian')||!student.personTypes?.includes('student')||
     !validId(guardian.cognitoSub))continue;
  const srutiId=await reader.guardianLinkId('sruti',guardian.personId,student.personId);
  if(await reader.link(srutiId))continue;
  records.push({studentId:student.personId,subject:guardian.cognitoSub});
  if(records.length>200)throw bad(413,'Too many Sruti candidates.');
 }
 return {records};
}

/** Admin may only stage a pending link for an independently approved Raagasudha pair. */
export async function finalSrutiGuardianRequest(reader,studentId,subject){
 if(!validId(studentId)||!validId(subject))throw bad(400,'Invalid student or account.');
 const guardianId=await canonicalGuardianPersonForSubject('sruti',subject,reader);
 const guardian=await reader.person(guardianId),student=await reader.person(studentId);
 if(!active(student,'sruti')||!student.personTypes?.includes('student')||guardian.familyId!==student.familyId)
  throw bad(409,'Student and guardian require Sruti membership reconciliation.');
 const srcId=await reader.guardianLinkId('raaga',guardianId,studentId);
 const src=await reader.link(srcId);
 if(!src||src.institutionId!=='raaga'||src.guardianPersonId!==guardianId||src.studentId!==studentId||
    src.familyId!==student.familyId||src.accessStatus!=='approved'||src.relationshipVerified!==true)
  throw bad(403,'Independent Raagasudha guardian relationship is not verified.');
 const destId=await reader.guardianLinkId('sruti',guardianId,studentId);
 const prior=await reader.link(destId);
 if(prior){
  if(prior.institutionId!=='sruti'||prior.guardianPersonId!==guardianId||prior.studentId!==studentId)throw bad(409,'Sruti link conflict.');
  if(prior.accessStatus==='pending'||prior.accessStatus==='approved')return {status:prior.accessStatus,submitted:false};
  throw bad(409,'Prior Sruti decision needs administrator review.');
 }
 return reader.createPendingSruti({linkId:destId,guardianPersonId:guardianId,studentId,familyId:student.familyId});
}
/** Evidence source for an already verified, approved Raagasudha link.
 * Approval itself remains an independent Sruti administrator action; the
 * transactional guardian service still rejects self-approval and stale versions.
 */
export async function verifiedRaagaGuardianEvidence(inst,guardianPersonId,studentId,reader){
 if(inst!=='sruti'||!validId(guardianPersonId)||!validId(studentId))throw bad(400,'Invalid guardian evidence request.');
 const sourceId=await reader.guardianLinkId('raaga',guardianPersonId,studentId);
 if(!validId(sourceId))throw bad(409,'Verified relationship evidence unavailable.');
 const source=await reader.link(sourceId);
 if(!source||source.linkId!==sourceId||source.recordType!=='guardian-access'||
    source.institutionId!=='raaga'||source.guardianPersonId!==guardianPersonId||
    source.studentId!==studentId||source.accessStatus!=='approved'||
    source.relationshipVerified!==true||!validId(source.familyId))
  throw bad(409,'An approved, verified Raagasudha guardian link is required.');
 const [guardian,student]=await Promise.all([reader.person(guardianPersonId),reader.person(studentId)]);
 if(!active(guardian,'sruti')||!active(student,'sruti')||
    !active(guardian,'raaga')||!active(student,'raaga')||
    guardian.familyId!==source.familyId||student.familyId!==source.familyId||
    !guardian.personTypes?.includes('guardian')||!student.personTypes?.includes('student'))
  throw bad(409,'Cross-academy family identity requires reconciliation.');
 return `raaga-link:${sourceId}`;
}
