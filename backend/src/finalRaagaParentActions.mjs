/** Canonical-only Raagasudha parent handoff for the existing website registration UI.
 * Approved website imports create verified family relationships; this facade
 * handles account identity only and never creates a second family or falls back to PK/SK.
 */
import { markerId, guardianLinkId } from './websiteImportCore.mjs';
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const validRegistration = (id) => typeof id === 'string' && /^RS-[A-Za-z0-9_-]{1,110}$/.test(id);
const validPerson = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{4,150}$/.test(id);
const validSubject = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(id);
const hasInst = (row, inst) =>
  Array.isArray(row?.institutionIds) && row.institutionIds.includes(inst);
const isInviteRequest = (body, externalId) =>
  body &&
  Object.keys(body).sort().join(',') === 'confirmReference,sendInvitation' &&
  body.confirmReference === externalId &&
  body.sendInvitation === true;
const isExistingAccountRequest = (body, externalId) =>
  body &&
  Object.keys(body).sort().join(',') === 'confirmReference,linkVerifiedAccount' &&
  body.confirmReference === externalId &&
  body.linkVerifiedAccount === true;
const isResendRequest = (body, externalId) =>
  body &&
  Object.keys(body).join(',') === 'confirmReference' &&
  body.confirmReference === externalId;

export async function canonicalRaagaParentSnapshot(externalId, reader) {
  if (!validRegistration(externalId)) fail(400, 'Invalid registration reference.');
  const reg = await reader.registration(markerId('raaga', externalId));
  if (
    !reg ||
    reg.registrationId !== markerId('raaga', externalId) ||
    reg.institutionId !== 'raaga' ||
    reg.source !== 'website' ||
    reg.externalRegistrationId !== externalId ||
    reg.importStatus !== 'imported' ||
    !validPerson(reg.familyId) ||
    !Array.isArray(reg.studentIds) ||
    reg.studentIds.length < 1 ||
    reg.studentIds.length > 20 ||
    reg.studentIds.some((id) => !validPerson(id)) ||
    new Set(reg.studentIds).size !== reg.studentIds.length
  )
    fail(409, 'Canonical import mapping requires administrator reconciliation.');
  const family = await reader.family(reg.familyId);
  if (
    !family ||
    family.familyId !== reg.familyId ||
    family.status !== 'active' ||
    !hasInst(family, 'raaga') ||
    !validPerson(family.primaryContactPersonId)
  )
    fail(409, 'Imported family identity requires administrator reconciliation.');
  const guardian = await reader.person(family.primaryContactPersonId);
  if (
    !guardian ||
    guardian.personId !== family.primaryContactPersonId ||
    guardian.familyId !== reg.familyId ||
    guardian.status !== 'active' ||
    !hasInst(guardian, 'raaga') ||
    !guardian.personTypes?.includes('guardian')
  )
    fail(409, 'Imported guardian identity requires administrator reconciliation.');
  const links = [];
  for (const id of reg.studentIds) {
    const student = await reader.person(id);
    if (
      !student ||
      student.personId !== id ||
      student.familyId !== reg.familyId ||
      student.status !== 'active' ||
      !hasInst(student, 'raaga') ||
      !student.personTypes?.includes('student')
    )
      fail(409, 'Imported student identity requires administrator reconciliation.');
    if (id === guardian.personId) continue; // Adult self access never gains a guardian link.
    const link = await reader.link(guardianLinkId('raaga', guardian.personId, id));
    if (
      !link ||
      link.linkId !== guardianLinkId('raaga', guardian.personId, id) ||
      link.guardianPersonId !== guardian.personId ||
      link.studentId !== id ||
      link.familyId !== reg.familyId ||
      link.institutionId !== 'raaga' ||
      link.recordType !== 'guardian-access' ||
      !['pending', 'approved', 'rejected', 'revoked'].includes(link.accessStatus)
    )
      fail(
        409,
        'Guardian review record missing or inconsistent. Do not recreate it automatically.',
      );
    links.push(link);
  }
  return { registration: reg, family, guardian, links };
}

export async function canonicalRaagaParentAction(action, externalId, body, claims, reader) {
  if (!claims?.sub) fail(401, 'Sign in required.');
  const {
    registration: reg,
    guardian,
    links,
  } = await canonicalRaagaParentSnapshot(externalId, reader);
  const status = reg.provisioningStatus || 'NOT_INVITED';
  const verifiedLink = async () => {
    if (!validPerson(guardian.cognitoSub))
      fail(409, 'Guardian account has not been linked to a verified identity.');
    const guard = await reader.subjectGuard(guardian.cognitoSub, 'raaga');
    if (guard?.personId !== guardian.personId)
      fail(409, 'Canonical Cognito uniqueness guard is missing or inconsistent.');
  };
  if (action === 'queue-parent-links') {
    if (Object.keys(body || {}).length) fail(400, 'Unexpected guardian queue parameters.');
    if (!['EXISTING_ACCOUNT_LINKED', 'ACCOUNT_FOUND', 'ACTIVE'].includes(status))
      fail(409, 'Verified parent account required before guardian review.');
    await verifiedLink();
    const relationshipsVerified = links.every(
      (x) => x.accessStatus === 'approved' && x.relationshipVerified === true,
    );
    // Import already created these review records. Never duplicate a pending link
    // or reset a rejected/revoked/approved independent administrator decision.
    return {
      queued: 0,
      alreadyExists: links.length,
      pending: links.filter((x) => x.accessStatus === 'pending').length,
      approved: links.filter(
        (x) => x.accessStatus === 'approved' && x.relationshipVerified === true,
      ).length,
      requiresIndependentReview: !relationshipsVerified,
      guardianRelationshipsVerified: relationshipsVerified,
      guardianAccessGranted: false,
    };
  }
  if (action === 'provision-parent') {
    if (['EXISTING_ACCOUNT_LINKED', 'ACCOUNT_FOUND', 'ACTIVE'].includes(status)) {
      if (Object.keys(body || {}).length && !isInviteRequest(body, externalId))
        fail(400, 'This account is already linked. Do not relink or create another account.');
      await verifiedLink();
      return { status: 'ACCOUNT_FOUND', alreadyProcessed: true, guardianAccessGranted: false };
    }
    if (status === 'INVITATION_SENT') {
      // After Cognito confirmation an administrator may link only the subject
      // recorded on the original canonical invitation. Cognito email verification,
      // uniqueness and guardian permissions are enforced by the link transaction.
      if (body && Object.keys(body).sort().join(',') === 'confirmReference,expectedSubject') {
        if (
          body.confirmReference !== externalId ||
          !validSubject(body.expectedSubject) ||
          body.expectedSubject !== reg.parentAccountSub
        )
          fail(409, 'Invitation identity differs from the selected verified Cognito subject.');
        if (typeof reader.linkVerifiedAccount !== 'function')
          fail(503, 'Canonical verified-account linking is unavailable.');
        const result = await reader.linkVerifiedAccount(
          reg.registrationId,
          'raaga',
          claims,
          body.expectedSubject,
        );
        return {
          ...result,
          status: result.linked ? 'ACCOUNT_FOUND' : 'NEEDS_VERIFICATION',
          guardianAccessGranted: false,
          invitationSent: true,
        };
      }
      if (Object.keys(body || {}).length && !isInviteRequest(body, externalId))
        fail(400, 'Use independent verified-account reconciliation, not another invitation.');
      return { status: 'INVITATION_SENT', alreadyProcessed: true, guardianAccessGranted: false };
    }
    if (guardian.cognitoSub)
      fail(
        409,
        'Provisioning state and Cognito link disagree; administrator reconciliation required.',
      );
    if (status !== 'NOT_INVITED')
      fail(409, 'Provisioning state requires manual administrator review.');
    if (!body || Object.keys(body).length === 0)
      return {
        status: 'NOT_INVITED',
        disabled: true,
        reason:
          'Explicitly confirm the registration before requesting an invitation or supply an independently verified existing Cognito subject.',
        guardianAccessGranted: false,
      };
    if (isInviteRequest(body, externalId)) {
      if (typeof reader.inviteNewAccount !== 'function')
        fail(503, 'Canonical parent invitation handler is unavailable.');
      return reader.inviteNewAccount(reg, guardian, claims.sub);
    }
    if (isExistingAccountRequest(body, externalId)) {
      if (typeof reader.linkVerifiedAccount !== 'function')
        fail(503, 'Canonical verified-account linking is unavailable.');
      const result = await reader.linkVerifiedAccount(reg.registrationId, 'raaga', claims, '');
      return {
        ...result,
        status: result.linked ? 'ACCOUNT_FOUND' : 'NEEDS_VERIFICATION',
        guardianAccessGranted: false,
        invitationSent: false,
      };
    }
    if (
      Object.keys(body).sort().join(',') !== 'confirmReference,expectedSubject' ||
      body.confirmReference !== externalId ||
      !validSubject(body.expectedSubject)
    )
      fail(400, 'Specify the exact registration reference and verified Cognito subject.');
    if (typeof reader.linkVerifiedAccount !== 'function')
      fail(503, 'Canonical verified-account linking is unavailable.');
    const result = await reader.linkVerifiedAccount(
      reg.registrationId,
      'raaga',
      claims,
      body.expectedSubject,
    );
    return {
      ...result,
      status: result.linked ? 'ACCOUNT_FOUND' : 'NEEDS_VERIFICATION',
      guardianAccessGranted: false,
      invitationSent: false,
    };
  }
  if (action === 'resend-parent-invitation') {
    if (status !== 'INVITATION_SENT') fail(409, 'No pending invitation to resend.');
    if (!isResendRequest(body, externalId))
      fail(400, 'Confirm the exact registration reference to resend an invitation.');
    if (typeof reader.resendInvitation !== 'function')
      fail(503, 'Canonical invitation resend handler is unavailable.');
    return reader.resendInvitation(reg, guardian, claims.sub);
  }
  fail(405, 'Unsupported parent account operation.');
}
