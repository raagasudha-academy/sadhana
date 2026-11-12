import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const home = readNormalizedSource(new URL('../familyAccess.ts', import.meta.url), 'utf8');
const router = readNormalizedSource(new URL('../tableRouter.ts', import.meta.url), 'utf8');
test('linked students must be approved before overview is returned', () => {
  assert.match(home, /canReadStudent/);
  assert.match(home, /myStudentLinks/);
});
test('split routing keeps academy access in admin and calendar in calendar', () => {
  assert.match(router, /pk\.startsWith\('ACCESS#'\)/);
  assert.match(router, /calendar:'sadhana-dev-calendar'/);
});
