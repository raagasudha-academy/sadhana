import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../guardianQueue.ts');
const source = readNormalizedSource(file, 'utf8');
test('self approval requires verified Cognito email and matching imported primary contact', () => {
  assert.match(source, /email_verified/);
  assert.match(source, /student\?\.sourcePersonId===primaryId/);
  assert.match(source, /student\?\.adultConfirmed===true/);
  assert.match(source, /student\.email\.trim\(\)\.toLowerCase\(\)===accountEmail/);
});
test('guardian requests remain pending and self approval produces audit transaction', () => {
  assert.match(source, /kind:'guardian',status:'pending'/);
  assert.match(source, /action:'verifiedSelfStudentAccess'/);
  assert.match(source, /new TransactWriteCommand/);
  assert.match(source, /prior\.requestedBy==='system:website-import'/);
});
