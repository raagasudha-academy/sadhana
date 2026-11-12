import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';
import { finalLinkedStudents, finalFamilyAccessRoute } from '../finalFamilyAccess.mjs';

const readNormalizedSource = (...args) => normalizeCodeWhitespace(readFileSync(...args));

const inst = 'sruti',
  subject = 'verified-cognito-sub';
const actor = {
  personId: 'PER_GUARDIAN',
  cognitoSub: subject,
  status: 'active',
  institutionIds: [inst],
  personTypes: ['guardian'],
  familyId: 'FAM_SHARED',
};
const student = {
  personId: 'PER_STUDENT',
  status: 'active',
  institutionIds: [inst],
  personTypes: ['student'],
  familyId: 'FAM_SHARED',
  firstName: 'Asha',
  lastName: 'K',
  studentProfile: { rollNumbers: { sruti: '001-002' } },
};
const link = {
  linkId: 'link_approved',
  guardianPersonId: actor.personId,
  studentId: student.personId,
  institutionId: inst,
  familyId: actor.familyId,
  accessStatus: 'approved',
  relationshipVerified: true,
};
const base = {
  peopleForSubject: async () => [actor],
  person: async (id) => (id === actor.personId ? actor : id === student.personId ? student : null),
  linksForGuardian: async () => [link],
  link: async () => link,
};
const harness = (reader = base) => {
  const calls = [];
  return {
    calls,
    deps: {
      assertConfigured: () => calls.push('ack'),
      reader: () => {
        calls.push('reader');
        return reader;
      },
    },
  };
};
const env = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_DATA_MODE: 'off',
  SADHANA_FINAL_FAMILY_READS: 'enabled',
};
const ctx = (
  path = ['family-access', 'mine'],
  method = 'GET',
  institution = inst,
  sub = subject,
) => ({ parts: path, method, query: { institution }, claims: sub ? { sub } : null });

test('legacy/split default is unchanged: no reader or ACK required', async () => {
  const { calls, deps } = harness();
  assert.equal(
    await finalFamilyAccessRoute(ctx(), deps, { ...env, SADHANA_ENTITY_TABLE_SET: 'm9' }),
    undefined,
  );
  assert.deepEqual(calls, []);
});
test('final route needs ACK, no split, independent read flag and verified JWT', async () => {
  for (const values of [
    { SADHANA_ENTITY_FINAL_ACK: '' },
    { SADHANA_DATA_MODE: 'split' },
    { SADHANA_FINAL_FAMILY_READS: '' },
  ]) {
    const { calls, deps } = harness();
    const r = await finalFamilyAccessRoute(ctx(), deps, { ...env, ...values });
    assert.equal(r.status, 503);
    assert.deepEqual(calls, []);
  }
  const { calls, deps } = harness();
  assert.equal((await finalFamilyAccessRoute(ctx(), deps, env)).status, 200);
  assert.deepEqual(calls, ['ack', 'reader']);
});
test('existing learner portal contract: only active approved guardian students', async () => {
  const { deps } = harness();
  const r = await finalFamilyAccessRoute(ctx(), deps, env);
  assert.deepEqual(r.body, {
    records: [
      {
        id: 'PER_STUDENT',
        name: 'Asha K',
        rollNumber: '001-002',
        kind: 'guardian',
        relationship: 'child',
      },
    ],
  });
});
test('first Sruti login reconciles the confirmed invitation before listing its approved children', async () => {
  let linkedSubject = '';
  const reader = {
    ...base,
    peopleForSubject: async () => [],
    linkInvitedSrutiParent: async (sub) => {
      linkedSubject = sub;
      return actor;
    },
  };
  assert.deepEqual(await finalLinkedStudents(inst, subject, reader), {
    records: [
      {
        id: 'PER_STUDENT',
        name: 'Asha K',
        rollNumber: '001-002',
        kind: 'guardian',
        relationship: 'child',
      },
    ],
  });
  assert.equal(linkedSubject, subject);
});
test('approved guardian link can bridge separate family records without moving either person', async () => {
  const otherFamilyGuardian = { ...actor, familyId: 'FAM_PARENT' };
  const crossLink = { ...link, familyId: 'FAM_SHARED', guardianFamilyId: 'FAM_PARENT' };
  const reader = {
    ...base,
    peopleForSubject: async () => [otherFamilyGuardian],
    person: async (id) => (id === otherFamilyGuardian.personId ? otherFamilyGuardian : student),
    linksForGuardian: async () => [crossLink],
    link: async () => crossLink,
  };
  assert.deepEqual(await finalLinkedStudents(inst, subject, reader), {
    records: [
      {
        id: student.personId,
        name: 'Asha K',
        rollNumber: '001-002',
        kind: 'guardian',
        relationship: 'child',
      },
    ],
  });
});
test('no access from pending, revoked, unverified, mismatched and stale GSI links', async () => {
  const cases = [
    { accessStatus: 'pending' },
    { accessStatus: 'revoked' },
    { relationshipVerified: false },
    { familyId: 'FAM_DIFFERENT' },
    { institutionId: 'raaga' },
    { studentId: 'PER_WRONG' },
  ];
  for (const edits of cases) {
    const row = { ...link, ...edits };
    const reader = { ...base, linksForGuardian: async () => [link], link: async () => row };
    assert.deepEqual(await finalLinkedStudents(inst, subject, reader), { records: [] });
  }
});
test('revoked Cognito identity cannot retain cached GSI learner access', async () => {
  const reader = {
    ...base,
    person: async (id) => (id === actor.personId ? { ...actor, status: 'archived' } : student),
  };
  await assert.rejects(() => finalLinkedStudents(inst, subject, reader), { status: 403 });
});
test('only JWT subject identity is resolved; ambiguous identities fail closed', async () => {
  const other = { ...actor, personId: 'PER_OTHER' };
  await assert.rejects(
    () =>
      finalLinkedStudents(inst, subject, { ...base, peopleForSubject: async () => [actor, other] }),
    { status: 409 },
  );
  assert.deepEqual(await finalLinkedStudents('raaga', subject, base), { records: [] });
});
test('student self-access needs active verified student person, not email or guardian link', async () => {
  const self = { ...student, cognitoSub: subject };
  const reader = {
    ...base,
    peopleForSubject: async () => [self],
    person: async () => self,
    linksForGuardian: async () => {
      throw Error('not needed');
    },
  };
  assert.deepEqual(await finalLinkedStudents(inst, subject, reader), {
    records: [
      {
        id: 'PER_STUDENT',
        name: 'Asha K',
        rollNumber: '001-002',
        kind: 'student',
        relationship: 'self',
      },
    ],
  });
});
test('cross-academy, invalid route and unauthenticated request fail before database', async () => {
  for (const context of [
    ctx(['family-access', 'mine'], 'POST'),
    ctx(['family-access', 'mine'], 'GET', 'shared'),
    ctx(['family-access', 'mine'], 'GET', inst, ''),
  ]) {
    const { calls, deps } = harness();
    const r = await finalFamilyAccessRoute(context, deps, env);
    assert.ok([400, 401, 405].includes(r.status));
    assert.deepEqual(calls, []);
  }
});
test('canonical reader and dispatcher contain no legacy DB fallback', () => {
  const lambda = readNormalizedSource(new URL('../lambda.ts', import.meta.url), 'utf8');
  const data = readNormalizedSource(
    new URL('../finalFamilyAccessData.ts', import.meta.url),
    'utf8',
  );
  const route = lambda.indexOf('await finalFamilyAccessRoute(routeContext');
  assert.ok(
    route > lambda.indexOf('finalReadRoute(routeContext') &&
      route < lambda.indexOf('finalCoreIdentityRoute(routeContext'),
  );
  assert.ok(route < lambda.indexOf("finalOnlyGate(parts,method,'fallback')"));
  assert.ok(data.includes("entityTable('people')") === false); // dynamic lookup, never hardcoded main table
  assert.ok(data.includes('entityTable(entity)'));
  assert.ok(data.includes('ConsistentRead:true'));
  assert.ok(!data.includes('makeRoutedClient') && !data.includes('SADHANA_TABLE_NAME'));
});

test('parent studying in Raagasudha is not shown as Sruti student', async () => {
  const dual = {
    ...actor,
    personTypes: ['guardian', 'student'],
    institutionIds: ['raaga', 'sruti'],
    studentProfile: { rollNumbers: { raaga: 'RS-007' } },
  };
  const reader = {
    ...base,
    peopleForSubject: async () => [dual],
    person: async (id) => (id === dual.personId ? dual : student),
  };
  assert.deepEqual(
    (await finalLinkedStudents('sruti', subject, reader)).records.map((r) => r.id),
    ['PER_STUDENT'],
  );
  assert.deepEqual(
    (
      await finalLinkedStudents('raaga', subject, { ...reader, linksForGuardian: async () => [] })
    ).records.map((r) => r.id),
    ['PER_GUARDIAN'],
  );
});
test('self learner permission is academy-specific even when person has guardian membership', async () => {
  const { authorisedStudent } = await import('../finalAccessCore.mjs');
  const dual = {
    ...actor,
    personTypes: ['guardian', 'student'],
    institutionIds: ['raaga', 'sruti'],
    studentProfile: { rollNumbers: { raaga: 'RS-007' } },
  };
  assert.throws(() => authorisedStudent(dual, dual, [], 'sruti'), { status: 403 });
  assert.equal(authorisedStudent(dual, dual, [], 'raaga').kind, 'self');
});
