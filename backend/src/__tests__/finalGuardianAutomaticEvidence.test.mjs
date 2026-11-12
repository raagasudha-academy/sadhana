import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedRaagaGuardianEvidence } from '../finalGuardianQueue.mjs';
import { finalCoreIdentityRoute } from '../finalCoreIdentity.mjs';

const guardian = {
  personId: 'GUARDIAN-0001',
  familyId: 'FAMILY-0001',
  personTypes: ['guardian'],
  institutionIds: ['raaga', 'sruti'],
  status: 'active',
  cognitoSub: 'guardian-sub',
};
const student = {
  personId: 'STUDENT-0001',
  familyId: 'FAMILY-0001',
  personTypes: ['student'],
  institutionIds: ['raaga', 'sruti'],
  status: 'active',
};
const source = {
  linkId: 'LINK-RAAGA-001',
  recordType: 'guardian-access',
  institutionId: 'raaga',
  guardianPersonId: guardian.personId,
  studentId: student.personId,
  familyId: guardian.familyId,
  accessStatus: 'approved',
  relationshipVerified: true,
};
const reader = (opts = {}) => ({
  guardianLinkId: async () => source.linkId,
  link: async () => source,
  person: async (id) => (id === guardian.personId ? guardian : student),
  peopleForSubject: async () => [guardian],
  ...opts,
});

test('exact approved source link provides a stable server-derived audit reference', async () => {
  assert.equal(
    await verifiedRaagaGuardianEvidence('sruti', guardian.personId, student.personId, reader()),
    'raaga-link:LINK-RAAGA-001',
  );
});
test('missing, unverified, pending, cross-academy or family-mismatched links never become evidence', async () => {
  for (const r of [
    reader({ link: async () => null }),
    reader({ link: async () => ({ ...source, relationshipVerified: false }) }),
    reader({ link: async () => ({ ...source, accessStatus: 'pending' }) }),
    reader({ link: async () => ({ ...source, institutionId: 'sruti' }) }),
    reader({ link: async () => ({ ...source, familyId: 'OTHER-FAMILY' }) }),
    reader({
      person: async (id) =>
        id === guardian.personId ? guardian : { ...student, institutionIds: ['raaga'] },
    }),
  ])
    await assert.rejects(
      () => verifiedRaagaGuardianEvidence('sruti', guardian.personId, student.personId, r),
      { status: 409 },
    );
  await assert.rejects(
    () => verifiedRaagaGuardianEvidence('raaga', guardian.personId, student.personId, reader()),
    { status: 400 },
  );
});
test('Sruti approve route derives evidence server-side and retains existing transaction decision', async () => {
  let captured;
  const deps = {
    assertConfigured: () => {},
    parse: (e) => JSON.parse(e.body),
    guardianReader: () => reader(),
    guardian: () => ({
      decide: async (...args) => {
        captured = args;
        return { status: 'approved' };
      },
    }),
  };
  const access = { admin: () => {} };
  const env = {
    SADHANA_ENTITY_TABLE_SET: 'final',
    SADHANA_DATA_MODE: 'final',
    SADHANA_ENTITY_FINAL_ACK: 'enabled',
    SADHANA_FINAL_GUARDIAN_DECISIONS: 'enabled',
  };
  const body = {
    subject: 'guardian-sub',
    studentId: student.personId,
    expectedVersion: 1,
    decision: 'approved',
    relationshipVerified: true,
    verificationSource: 'approved-raaga-link',
  };
  const ctx = {
    parts: ['family-access', 'decide'],
    method: 'POST',
    claims: { sub: 'admin-other' },
    query: { institution: 'sruti' },
    inst: 'sruti',
    event: { body: JSON.stringify(body) },
  };
  const out = await finalCoreIdentityRoute(ctx, deps, access, env);
  assert.equal(out.status, 200);
  assert.deepEqual(captured[2], {
    guardianPersonId: guardian.personId,
    studentId: student.personId,
    decision: 'approved',
    expectedVersion: 1,
    relationshipVerified: true,
    evidenceReference: 'raaga-link:LINK-RAAGA-001',
  });
  assert.equal(
    (
      await finalCoreIdentityRoute(
        { ...ctx, query: { institution: 'raaga' }, inst: 'raaga' },
        deps,
        access,
        env,
      )
    ).status,
    400,
  );
});
