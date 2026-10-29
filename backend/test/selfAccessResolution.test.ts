import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/v117GuardianQueue.ts',import.meta.url),'utf8');
test('v11.7.7 only converts verified adult self and keeps guardians pending',()=>{
 assert.match(source,/isVerifiedSelfCandidate\(studentRecords/);
 assert.match(source,/student\?\.adultConfirmed===true/);
 assert.match(source,/verifiedAccountEmail\(marker.parentAccountSub\)/);
 assert.match(source,/studentMember\?\.studentType==='adult'/);
 assert.match(source,/prior.status==='pending'&&prior.kind==='guardian'/);
 assert.match(source,/isAccountSubject\(prior.requestedBy\)/);
 assert.match(source,/prior.requestedBy!==marker.parentAccountSub/);
 assert.match(source,/requestedBy <> :beneficiary/);
 assert.match(source,/studentRecords.get\(studentId\)\?\.relationship==='self'/);
 assert.match(source,/kind:'guardian',status:'pending'/);
 assert.match(source,/diagnostics,status:/);
});
