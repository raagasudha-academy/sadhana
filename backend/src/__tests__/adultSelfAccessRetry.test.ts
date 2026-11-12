import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const retry = readNormalizedSource(new URL('../adultSelfAccessRetry.ts', import.meta.url), 'utf8');
const family = readNormalizedSource(new URL('../familyAccess.ts', import.meta.url), 'utf8');
const verifier = readNormalizedSource(new URL('../guardianQueue.ts', import.meta.url), 'utf8');
test('automatic adult access requires immutable subject and independent adult import', () => {
  assert.match(retry, /isAccountSubject\(subject\)/);
  assert.match(retry, /marker\.parentAccountSub!==subject/);
  assert.match(retry, /marker\.independentAdult!==true/);
  assert.match(retry, /checked>10000/);
});
test('portal retry uses established identity-verifying resolver only', () => {
  assert.match(retry, /enqueueImportedGuardianReviews\(marker\.registrationId\)/);
  assert.match(verifier, /verifiedAccountEmail\(marker\.parentAccountSub\)/);
  assert.match(verifier, /isVerifiedSelfCandidate/);
  assert.match(verifier, /kind:'student',status:'approved'/);
  assert.match(family, /retryVerifiedAdultSelfAccess\(claims\.sub,inst\)/);
});
