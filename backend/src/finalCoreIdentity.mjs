/**
 * Final-entity-table core/guardian write facade.
 *
 * Intentionally delegates only to the existing schema-aware, transactional
 * M10 core writer and M95 guardian service. No legacy PK/SK repository access.
 * Optional, independent write switches are all disabled by default.
 */
const fail = (message, status = 503) => ({status, body: {error: message}});
const coreRoots = new Set(['families', 'students', 'enrolments']);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{4,150}$/.test(value);
const legacyStudentPost = parts => parts?.length===2&&parts[0]==='operations'&&parts[1]==='student';
const legacyStudentPatch = parts => parts?.length===3&&parts[0]==='operations'&&parts[1]==='student'&&validId(parts[2]);
const validInstitution = value => value === 'raaga' || value === 'sruti';
import {finalGuardianQueue,canonicalGuardianPersonForSubject,finalSrutiGuardianCandidates,finalSrutiGuardianRequest,verifiedRaagaGuardianEvidence} from './finalGuardianQueue.mjs';

export async function finalCoreIdentityRoute(context, dependencies, access, env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const {parts, method, event, claims, query = {}} = context;
  if (!Array.isArray(parts) || !(coreRoots.has(parts[0]) || parts[0] === 'family-access' || legacyStudentPost(parts) || legacyStudentPatch(parts))) return undefined;
  // GET directory responses are handled by the canonical final read facade.
  if (coreRoots.has(parts[0]) && method === 'GET') return undefined;
  if (!claims?.sub) return fail('Authenticated account required.', 401);
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return fail('Final-table cutover has not been authorised.');
  const institution = query.institution ?? context.inst;
  if (!validInstitution(institution)) return fail('Choose a valid institution.', 400);

  if(legacyStudentPost(parts)){
    if(method!=='POST')return undefined;
    if(env.SADHANA_FINAL_CORE_WRITES!=='enabled')return fail('Final core writes are disabled.');
    access.admin(claims,institution);
    const payload=dependencies.parse(event);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return fail('Student details required.',400);
    // Explicit existing-person selection prevents a duplicate record or accidental child link.
    if(payload.existingPersonId!==undefined||payload.existingPersonRole!==undefined){
      if(Object.keys(payload).some(k=>!['existingPersonId','existingPersonRole','familyId','relationship'].includes(k))||
         payload.relationship!=='parent_guardian'||
         !(payload.existingPersonRole==='primary_guardian'||typeof payload.existingPersonId==='string'))return fail('Select an existing guardian using their person ID.',400);
      dependencies.assertConfigured();
      return {status:201,body:{record:await dependencies.core().registerExistingGuardianAsStudent(institution,claims,payload)}};
    }
    if(Object.keys(payload).some(k=>!['name','email','phone','location','familyId','adultConfirmed','relationship'].includes(k)))
      return fail('Unexpected student field.',400);
    if(typeof payload.name!=='string'||!payload.name.trim())return fail('Student name required.',400);
    if(payload.relationship==='parent_guardian')return fail('Select existing parent/guardian identity instead.',409);
    const independent=!payload.familyId;
    if(independent&&payload.adultConfirmed!==true)return fail('Independent adult confirmation required.',400);
    if(!independent&&payload.relationship!==undefined&&payload.relationship!=='child')return fail('Family relationship must be child.',400);
    dependencies.assertConfigured();
    const record=await dependencies.core().create('students',institution,claims,{
      name:payload.name,email:payload.email||'',phone:payload.phone||'',location:payload.location||'',familyId:payload.familyId||'',
      registrationType:independent?'independent':'family',adultConfirmed:independent===true,
      createdIn:institution
    });
    return {status:201,body:{record}};
  }
  if (coreRoots.has(parts[0])) {
    if (!['POST', 'PATCH'].includes(method)) return fail('Core records cannot be deleted by this API.', 405);
    if (env.SADHANA_FINAL_CORE_WRITES !== 'enabled') return fail('Final core writes are disabled.');
    access.admin(claims, institution);
    if (!((method === 'POST' && parts.length === 1) ||
          (method === 'PATCH' && parts.length === 2 && validId(parts[1]))))
      return fail('Unsupported core write path.', 405);
    dependencies.assertConfigured();
    const body = dependencies.parse(event);
    if (method === 'POST')
      return {status: 201, body: {record: await dependencies.core().create(parts[0], institution, claims, body)}};
    return {status: 200, body: {record: await dependencies.core().update(parts[0], institution, claims, parts[1], body)}};
  }

  // The existing admin student editor still uses /operations/student/:id.
  // Route that PATCH into the canonical, versioned student writer; never let
  // it fall through to the retired legacy repository.
  if (legacyStudentPatch(parts)) {
    if (method !== 'PATCH') return fail('Unsupported student write method.', 405);
    if (env.SADHANA_FINAL_CORE_WRITES !== 'enabled') return fail('Final core writes are disabled.');
    access.admin(claims, institution);
    dependencies.assertConfigured();
    const body = dependencies.parse(event);
    return {status: 200, body: {record: await dependencies.core().update('students', institution, claims, parts[2], body)}};
  }

  // Canonical Sruti cross-academy candidate discovery and pending-only requests.
  // The old PK/SK crossAcademyGuardian implementation must never run in final mode.
  if(parts.length===2&&parts[1]==='sruti-candidates'&&method==='GET'){
    if(institution!=='sruti')return fail('Sruti academy required.',400);
    if(env.SADHANA_FINAL_GUARDIAN_QUEUE_READS!=='enabled')return fail('Final guardian queue disabled.');
    access.admin(claims,institution);dependencies.assertConfigured();
    return {status:200,body:await finalSrutiGuardianCandidates(dependencies.guardianReader())};
  }
  if(parts.length===2&&parts[1]==='sruti-request'&&method==='POST'){
    if(institution!=='sruti')return fail('Sruti academy required.',400);
    if(env.SADHANA_FINAL_GUARDIAN_REQUESTS!=='enabled')return fail('Final guardian requests disabled.');
    access.admin(claims,institution);
    const body=dependencies.parse(event);
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['studentId','subject'].includes(k))||
      !validId(body.studentId)||!validId(body.subject))return fail('Valid guardian and student required.',400);
    dependencies.assertConfigured();
    return {status:201,body:await finalSrutiGuardianRequest(dependencies.guardianReader(),body.studentId,body.subject)};
  }

  // The administrator queue uses canonical guardian links and independently
  // verified Cognito identities. It cannot approve or create a link.
  if(parts.length===2&&parts[1]==='requests'&&method==='GET'){
    if(env.SADHANA_FINAL_GUARDIAN_QUEUE_READS!=='enabled')return fail('Final guardian request queue disabled.');
    access.admin(claims,institution);
    dependencies.assertConfigured();
    return {status:200,body:await finalGuardianQueue(institution,dependencies.guardianReader())};
  }

  // The existing UI sends the immutable Cognito subject; the transactional
  // guardian service requires a canonical person ID. Reconcile explicitly.
  if(parts.length===2&&parts[1]==='decide'&&method==='POST'){
    if(env.SADHANA_FINAL_GUARDIAN_DECISIONS!=='enabled')return fail('Final guardian decisions disabled.');
    access.admin(claims,institution);
    const body=dependencies.parse(event);
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(key=>!['subject','studentId','decision','expectedVersion','relationshipVerified','evidenceReference','verificationSource'].includes(key))||
      !validId(body.subject)||!validId(body.studentId)||
      !['approved','rejected','revoked'].includes(body.decision)||
      !Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||
      (body.decision==='approved'&&(body.relationshipVerified!==true||
        !(typeof body.evidenceReference==='string'&&/^[-A-Za-z0-9_#.:]{4,180}$/.test(body.evidenceReference))&&
        !(institution==='sruti'&&body.verificationSource==='approved-raaga-link'))))
      return fail('Independent evidence and a valid decision are required.',400);
    dependencies.assertConfigured();
    const guardianPersonId=await canonicalGuardianPersonForSubject(institution,body.subject,dependencies.guardianReader());
    const evidenceReference=body.decision==='approved'&&body.verificationSource==='approved-raaga-link'
      ? await verifiedRaagaGuardianEvidence(institution,guardianPersonId,body.studentId,dependencies.guardianReader())
      : body.evidenceReference;
    return {status:200,body:await dependencies.guardian().decide(institution,claims,{
      guardianPersonId,studentId:body.studentId,decision:body.decision,
      expectedVersion:body.expectedVersion,relationshipVerified:body.relationshipVerified===true,
      ...(body.decision==='approved'?{evidenceReference}:{})
    })};
  }

  // Guardian requests create *pending* evidence; decisions require separate
  // administrator verification enforced again by the M95 service itself.
  if (parts.length !== 2 || method !== 'POST' || !['request', 'decide'].includes(parts[1]))
    return fail('Unsupported guardian operation. No legacy fallback.');
  const decision = parts[1] === 'decide';
  const flag = decision ? 'SADHANA_FINAL_GUARDIAN_DECISIONS' : 'SADHANA_FINAL_GUARDIAN_REQUESTS';
  if (env[flag] !== 'enabled') return fail('Final guardian operation is disabled.');
  if (decision) access.admin(claims, institution);
  dependencies.assertConfigured();
  const body = dependencies.parse(event);
  if (!decision && body && typeof body === 'object' && !Array.isArray(body) &&
      Object.prototype.hasOwnProperty.call(body, 'kind')) {
    // Existing portal requests include kind='guardian'. Translate only the
    // authenticated person's own guardian request; never interpret a student
    // request or an on-behalf account as approval to create guardian access.
    if (body.kind !== 'guardian' || Object.keys(body).some(key => !['studentId','rollNumber','kind'].includes(key)) ||
        Boolean(body.studentId) === Boolean(body.rollNumber))
      return fail('This account-link request needs independent administrator review.', 503);
    let studentId=body.studentId;
    if(body.rollNumber!==undefined){
      if(typeof body.rollNumber!=='string'||! /^(?:\d{3}-\d{3}|(?:RS|SR)-\d{3,})$/i.test(body.rollNumber.trim()))
        return fail('Enter a valid academy roll number.',400);
      studentId=await dependencies.guardianReader().studentForRoll(institution,body.rollNumber.trim().toUpperCase());
      if(!studentId)return fail('Unable to request access. Contact the academy.',400);
    }
    return {status: 201, body: await dependencies.guardian().request(institution, claims, {studentId})};
  }
  return decision
    ? {status: 200, body: await dependencies.guardian().decide(institution, claims, body)}
    : {status: 201, body: await dependencies.guardian().request(institution, claims, body)};
}
