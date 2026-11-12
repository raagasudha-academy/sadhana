import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const source = readNormalizedSource(new URL('../familyAccess.ts', import.meta.url), 'utf8');
const approve =
  source
    .split('export async function decideStudentAccess(')[1]
    ?.split('export async function myStudentOverview(')[0] || '';
test('home-academy profile access does not require class enrolment', () => {
  assert.match(approve, /if\(student\.Item\.institution!==inst\)/);
  assert.doesNotMatch(approve, /Student has no active enrolment/);
  // Only cross-academy approvals require a matching enrollment.
  assert.match(
    approve,
    /if\(student\.Item\.institution!==inst\)\s*\{[\s\S]*?OPS#\$\{inst\}#ENROLMENT/,
  );
});
test('approval still requires an active student and independent review', () => {
  assert.match(approve, /student\.Item\.archived/);
  assert.match(approve, /body\.relationshipVerified!==true/);
  assert.match(approve, /demandInstitution\(claims,inst\)/);
  assert.match(approve, /TransactWriteCommand/);
  assert.match(approve, /expectedVersion/);
});
