import test from 'node:test';
import assert from 'node:assert/strict';
import { projectM10Directory } from '../coreDirectoryProjection.mjs';
const person = {
  personId: 'p-guardian',
  firstName: 'Guardian',
  phone: '+447000000000',
  institutionIds: ['raaga', 'sruti'],
};
const family = {
  familyId: 'f-shared',
  familyNumber: '004',
  primaryContactPersonId: 'p-guardian',
  institutionIds: ['raaga', 'sruti'],
  version: 1,
};
test('one shared family number appears in each academy without rewriting IDs', () => {
  for (const inst of ['raaga', 'sruti']) {
    const result = projectM10Directory('families', [family], inst, [person]).records;
    assert.equal(result[0].id, 'f-shared');
    assert.equal(result[0].familyNumber, '004');
  }
});
test('missing family number is not fabricated by read projection', () => {
  const result = projectM10Directory(
    'families',
    [{ ...family, familyNumber: undefined }],
    'raaga',
    [person],
  ).records;
  assert.equal(result[0].familyNumber, '');
});
test('legacy payload does not override real canonical family number', () => {
  const result = projectM10Directory(
    'families',
    [{ ...family, legacyPayload: { id: 'f-shared', familyNumber: 'old' } }],
    'raaga',
    [person],
  ).records;
  assert.equal(result[0].familyNumber, '004');
});
