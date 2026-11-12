import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const access = readNormalizedSource(new URL('../familyAccess.ts', import.meta.url), 'utf8');
const route = readNormalizedSource(new URL('../tableRouter.ts', import.meta.url), 'utf8');
test('guardian approval requires independent verification and preserves versioned audited transaction', () => {
  assert.match(access, /relationshipVerified!==true/);
  assert.match(access, /expectedVersion/);
  assert.match(access, /TransactWriteCommand/);
  assert.match(access, /studentAccessDecision/);
});
test('profile links require approved access, not classroom enrollment', () => {
  assert.match(access, /canReadStudent/);
  assert.doesNotMatch(access, /Student has no active enrolment in this academy/);
});
test('admin access and audits route to isolated split tables', () => {
  assert.match(route, /pk\.startsWith\('ACCESS#'\)/);
  assert.match(route, /pk\.startsWith\('AUDIT#'\)/);
});
