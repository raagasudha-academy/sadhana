import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const queue=readFileSync(new URL('../src/v117GuardianQueue.ts',import.meta.url),'utf8');
const hook=readFileSync(new URL('../src/v117GuardianAutoHook.ts',import.meta.url),'utf8');
const provisioning=readFileSync(new URL('../src/parentAccountProvisioning.ts',import.meta.url),'utf8');
test('v11.7 guardian queue stays pending; verified adult self-access is separate',()=>{
 assert.match(queue,/status:'pending'/);
 assert.match(queue, /if\(isSelf\)/);
  assert.match(queue, /isVerifiedSelfCandidate/);
  assert.match(queue, /kind:'guardian',status:'pending'/);
  assert.doesNotMatch(queue, /kind:'guardian',status:'approved'/);
 assert.match(queue,/attribute_not_exists\(PK\)/);
 // Legacy imports may omit provenance attributes, but conflicting values must be rejected.
 assert.match(queue,/matchesImportedPerson\(student,website/);
 assert.match(queue,/!student\.sourceWebsiteRegistrationId \|\| student\.sourceWebsiteRegistrationId===registrationId/);
 assert.match(queue,/!student\.sourcePersonId \|\| student\.sourcePersonId===personId/);
 assert.match(queue,/evidence\.mappedStudentId===evidence\.studentId/);
 assert.match(queue,/student\.dateOfBirth===person\.dateOfBirth/);
 assert.match(queue,/kind:'guardian',status:'pending'/);
 assert.doesNotMatch(queue,/kind:'guardian',status:'approved'/);
 assert.match(queue,/Website import mapping differs/);
});
test('v11.7 queues on new and existing identity reconciliation without undoing imports',()=>{
 assert.match(provisioning,/tryQueueGuardianReviews\(registrationId\)/);
 assert.match(hook,/catch\(e\)/);
 assert.match(hook,/deferred:true/);
});
