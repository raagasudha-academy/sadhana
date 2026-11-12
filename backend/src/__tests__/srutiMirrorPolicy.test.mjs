import test from 'node:test';
import assert from 'node:assert/strict';
import { srutiWriterTables } from '../srutiMirrorPolicy.mjs';

test('source table is stage-specific with the environment prefix', () => {
  assert.deepEqual(srutiWriterTables({ SADHANA_ENTITY_STAGE: 'dev' }), {
    primary: 'dev-sruti-student-registrations',
  });
  assert.deepEqual(srutiWriterTables({ SADHANA_ENTITY_STAGE: 'prod' }), {
    primary: 'prod-sruti-student-registrations',
  });
});

test('rejects a source table that does not match the configured stage', () =>
  assert.throws(
    () =>
      srutiWriterTables({
        SADHANA_ENTITY_STAGE: 'dev',
        SRUTI_SOURCE_REGISTRATIONS_TABLE: 'prod-sruti-student-registrations',
      }),
    /does not match stage/,
  ));

test('rejects unsupported stages', () =>
  assert.throws(() => srutiWriterTables({ SADHANA_ENTITY_STAGE: 'unknown' }), /Unsupported/));
