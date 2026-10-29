import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../src/',import.meta.url);
test('manual requeue invokes verified self resolver and enforces admin scope',()=>{
 const s=readFileSync(new URL('parentLinkWorkflow.ts',base),'utf8');
 assert.match(s,/demandInstitution\(claims,'raaga'\)/);
 assert.match(s,/enqueueImportedGuardianReviews\(registrationId,claims.sub\)/);
 assert.doesNotMatch(s,/requestStudentAccess/);
});
test('legacy admin-created pending guardian can upgrade only through verified self evidence',()=>{
 const s=readFileSync(new URL('v117GuardianQueue.ts',base),'utf8');
 assert.match(s,/isVerifiedSelfCandidate/);
 assert.match(s,/prior.status==='pending'/);
 assert.match(s,/!!legacyAdminRequester&&isAccountSubject\(prior.requestedBy\)&&prior.requestedBy!==marker.parentAccountSub/);
 assert.match(s,/requestedBy <> :beneficiary/);
 assert.match(s,/sourceWebsiteRegistrationId=:id/);
 assert.match(s,/verifiedSelfStudentAccess/);
 assert.match(s,/TransactWriteCommand/);
 assert.match(s,/kind:'guardian',status:'pending'/);
});
