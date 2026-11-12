import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLegacyImportBridge } from '../legacyImportBridge.mjs';
const registration = () => ({
  registrationId: 'RS-demo123',
  institution: 'raaga',
  reviewStatus: 'approved',
  primaryContactPersonId: 'p1',
  people: [
    {
      personId: 'p1',
      fullName: 'Test Guardian',
      email: 'guardian@example.com',
      phone: '+447700900123',
      roles: ['guardian'],
    },
    { personId: 's1', fullName: 'Test Child', dateOfBirth: '2015-05-12' },
  ],
  students: [{ personId: 's1', foodAllergies: { status: 'none' } }],
  sadhanaImport: {
    status: 'imported',
    familyId: 'legacy-family-001',
    studentIds: { s1: 'legacy-student-001' },
  },
});
const plan = (r) =>
  prepareLegacyImportBridge(
    r,
    'raaga',
    'admin-sub',
    { family: 0, student: 0 },
    '2026-11-03T00:00:00Z',
  );
test('bridge writes only M9 records and retains legacy mapping', () => {
  const p = plan(registration());
  const marker = p.items.find((x) => x.table === 'registrations').item;
  assert.equal(marker.websiteSyncStatus, 'legacy-authoritative');
  assert.equal(marker.legacyFamilyId, 'legacy-family-001');
  assert.deepEqual(marker.legacyStudentIds, { s1: 'legacy-student-001' });
  assert.equal(marker.identityResolutionStatus, 'pending_guardian_verification');
  assert.equal(p.pendingGuardianLinks, 1);
  assert.equal(p.items.find((x) => x.table === 'family-links').item.accessStatus, 'pending');
  assert.equal(p.studentMappings[0].rollNumber, 'RS-001');
});
test('rejects unapproved or non-imported source', () => {
  const r = registration();
  r.reviewStatus = 'pending';
  assert.throws(() => plan(r));
  r.reviewStatus = 'approved';
  r.sadhanaImport.status = 'pending';
  assert.throws(() => plan(r));
});
test('rejects missing or conflicting source student mapping', () => {
  const r = registration();
  r.sadhanaImport.studentIds = { wrong: 'legacy-student-001' };
  assert.throws(() => plan(r));
  r.sadhanaImport.studentIds = { s1: 'bad id' };
  assert.throws(() => plan(r));
});
test('rejects source academy mismatch', () => {
  const r = registration();
  r.institution = 'sruti';
  assert.throws(() => plan(r));
  assert.throws(() =>
    prepareLegacyImportBridge(registration(), 'sruti', 'admin', { family: 0, student: 0 }),
  );
});
test('does not bypass validation of missing student date of birth', () => {
  const r = registration();
  delete r.people[1].dateOfBirth;
  assert.throws(() => plan(r));
});

test('accepts approved uppercase RAAGASUDHA source while writing canonical raaga records', () => {
  const r = registration();
  r.institution = 'RAAGASUDHA';
  const p = plan(r);
  const marker = p.items.find((x) => x.table === 'registrations').item;
  assert.equal(marker.institutionId, 'raaga');
  assert.equal(marker.legacyFamilyId, 'legacy-family-001');
  assert.equal(p.studentMappings.length, 1);
});
test('rejects other source academy aliases or missing institution', () => {
  for (const institution of ['SRUTI', 'Raagasudha', 'RAAGA', 'other', undefined, '']) {
    const r = registration();
    r.institution = institution;
    assert.throws(() => plan(r), { status: 409 });
  }
});
