import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (...args) => normalizeCodeWhitespace(readFileSync(...args));
const backend = readNormalizedSource(new URL('../academyDirectory.ts', import.meta.url), 'utf8');
test('public directory keeps allowlisted names and no private staff details', () => {
  assert.match(backend, /publicTeacher=\(x:any\)=>\(\{name:/);
  assert.match(backend, /publicAdmin\s*=\s*\(/);
  assert.doesNotMatch(backend, /return \{\.\.\.x/);
  assert.match(backend, /adminPhotoUrl\(sub,picture\)/);
  assert.match(backend, /ownProfilePhoto\(sub\)/);
});
test('stable public identifiers are hashed before they are published', () => {
  assert.match(backend, /createHash\('sha256'\)/);
});
test('learner guard runs before student-scoped academy directory lookup', () => {
  const lambda = readNormalizedSource(
    new URL('../routes/learningRoutes.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    lambda,
    /await learnerIdentity\(inst,claims,studentId\);return json\(200,await academyDirectory\(inst,studentId\)\)/,
  );
});
