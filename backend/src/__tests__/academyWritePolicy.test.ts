import test from 'node:test';
import assert from 'node:assert/strict';
import { validateM10AcademyWrite } from '../academyWritePolicy.mjs';

test('M10 classes create validates institution and forbids legacy keys', () => {
  const good = {
    classId: 'CLASS-RAAGA-TEST',
    institutionId: 'raaga',
    name: 'Test class',
    teacherPersonIds: ['per_abc'],
  };
  assert.deepEqual(validateM10AcademyWrite('classes', 'create', good, 'raaga'), good);
  assert.throws(() => validateM10AcademyWrite('classes', 'create', good, 'sruti'));
  assert.throws(() =>
    validateM10AcademyWrite('classes', 'create', { ...good, PK: 'CLASS#RAAGA' }, 'raaga'),
  );
  assert.throws(() =>
    validateM10AcademyWrite('classes', 'create', { ...good, legacyPayload: {} }, 'raaga'),
  );
});
test('M10 classes patch disallows institution or identity changes', () => {
  assert.deepEqual(validateM10AcademyWrite('classes', 'update', { name: 'Updated' }, 'raaga'), {
    name: 'Updated',
  });
  assert.throws(() =>
    validateM10AcademyWrite('classes', 'update', { institutionId: 'sruti' }, 'raaga'),
  );
  assert.throws(() => validateM10AcademyWrite('classes', 'update', { classId: 'OTHER' }, 'raaga'));
});
test('M10 venues require explicit institution and reject arbitrary fields', () => {
  assert.deepEqual(
    validateM10AcademyWrite(
      'venues',
      'create',
      { venueId: 'VENUE-1', institutionId: 'raaga', name: 'Venue' },
      'raaga',
    ).name,
    'Venue',
  );
  assert.throws(() =>
    validateM10AcademyWrite('venues', 'create', { venueId: 'VENUE-1', name: 'Venue' }, 'raaga'),
  );
  assert.throws(() => validateM10AcademyWrite('venues', 'update', { GSI1PK: 'x' }, 'raaga'));
});
