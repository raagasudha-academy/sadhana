import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const retry=readFileSync(new URL('../src/adultSelfAccessRetry.ts',import.meta.url),'utf8');
const family=readFileSync(new URL('../src/familyAccess.ts',import.meta.url),'utf8');
const verifier=readFileSync(new URL('../src/v117GuardianQueue.ts',import.meta.url),'utf8');
test('automatic adult access requires immutable subject and independent adult import',()=>{
 assert.match(retry,/isAccountSubject\(subject\)/);
 assert.match(retry,/marker\.parentAccountSub!==subject/);
 assert.match(retry,/marker\.independentAdult!==true/);
 assert.match(retry,/checked>10000/);
});
test('portal retry uses established identity-verifying resolver only',()=>{
 assert.match(retry,/enqueueImportedGuardianReviews\(marker\.registrationId\)/);
 assert.match(verifier,/verifiedAccountEmail\(marker\.parentAccountSub\)/);
 assert.match(verifier,/isVerifiedSelfCandidate/);
 assert.match(verifier,/kind:'student',status:'approved'/);
 assert.match(family,/retryVerifiedAdultSelfAccess\(claims\.sub,inst\)/);
});
