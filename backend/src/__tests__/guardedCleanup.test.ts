import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const code = readNormalizedSource(
  new URL('../../scripts/guardedCleanup.mjs', import.meta.url),
  'utf8',
);
test('M8 cleanup is plan-first and explicitly gated', () => {
  assert.match(code, /mode=args\.includes\('--apply'\)\?'apply':'plan'/);
  assert.match(code, /CONFIRM='DELETE 49 TEST RECORDS AND RESET 2 COUNTERS'/);
  assert.match(code, /r\.approved!==true/);
  assert.match(code, /SIGNOFFS\.some/);
  assert.match(code, /p\.planDigest!==planDigest\(planShape\(snap\)\)/);
  assert.match(code, /TransactWriteCommand/);
});
test('M8 cleanup preserves calendar and audit records, requires backup and strong reads', () => {
  assert.match(code, /if\(t==='calendar'\|\|t==='audit'\)return 'PROTECTED'/);
  assert.match(code, /BackupStatus!=='AVAILABLE'/);
  assert.match(code, /ConsistentRead:true/);
  assert.match(code, /if\(tx\.length!==51/);
  assert.match(code, /COUNTER_PK/);
});
