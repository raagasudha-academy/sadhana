import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertRaagaWebsiteSyncPolicy as policy } from '../raagaWebsiteSyncPolicy.mjs';

const final = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_DATA_MODE: 'off',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES: 'enabled',
  SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED: 'enabled',
};
test('final sync is independently enabled without M95 pilot flags', () => {
  assert.doesNotThrow(() => policy(false, final));
  assert.doesNotThrow(() => policy(true, final));
});
test('final write fails closed without independent sync and identity flags', () => {
  for (const key of [
    'SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES',
    'SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED',
  ])
    assert.throws(() => policy(true, { ...final, [key]: '' }), { status: 403 });
});
test('final read-only sync preview requires ACK and no split', () => {
  assert.throws(() => policy(false, { ...final, SADHANA_ENTITY_FINAL_ACK: '' }), { status: 503 });
  assert.throws(() => policy(false, { ...final, SADHANA_DATA_MODE: 'split' }), { status: 503 });
});
test('old M95 pilot flags do not bypass missing final ACKs', () => {
  assert.throws(
    () =>
      policy(true, {
        ...final,
        M95_ONBOARDING_MODE: 'enabled',
        M95_WEBSITE_SYNC_WRITES: 'enabled',
        SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES: '',
      }),
    { status: 403 },
  );
});
test('M9 pilot behaviour preserved for previews and writes', () => {
  const old = { SADHANA_ENTITY_TABLE_SET: 'm9' };
  assert.throws(() => policy(false, old), { status: 404 });
  assert.doesNotThrow(() => policy(false, { ...old, M95_ONBOARDING_MODE: 'enabled' }));
  assert.throws(() => policy(true, { ...old, M95_ONBOARDING_MODE: 'enabled' }), { status: 403 });
  assert.doesNotThrow(() =>
    policy(true, { ...old, M95_ONBOARDING_MODE: 'enabled', M95_WEBSITE_SYNC_WRITES: 'enabled' }),
  );
});
test('real website reconciliation entrypoint invokes independent policy', () => {
  const file = readFileSync(new URL('../websiteImport.ts', import.meta.url), 'utf8');
  const start = file.indexOf('export async function m95ReconcileWebsiteImport');
  assert.ok(start > 0);
  assert.ok(file.indexOf('assertRaagaWebsiteSyncPolicy(execute)', start) > start);
});
