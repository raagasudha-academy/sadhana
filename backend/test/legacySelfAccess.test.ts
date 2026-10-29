import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const src=readFileSync(new URL('../src/v117GuardianQueue.ts',import.meta.url),'utf8');
test('legacy adult self access uses source mapping, verified account and adult student evidence',()=>{
 assert.match(src,/evidence\.mappedStudentId===evidence\.studentId/);
 assert.match(src,/student\?\.adultConfirmed===true/);
 assert.match(src,/studentMember\?\.studentType==='adult'/);
 assert.match(src,/applicantPersonIds/);
 assert.match(src,/contact\.email\.trim\(\)\.toLowerCase\(\)===accountEmail/);
 assert.match(src,/verifiedLegacyAdult/);
 assert.match(src,/person\.email\.trim\(\)\.toLowerCase\(\)===verifiedEmail/);
 assert.match(src,/!student\?\.dateOfBirth \|\| student\.dateOfBirth===contact\.dateOfBirth/);
 assert.match(src,/!student\.email\.trim\(\) \|\| student\.email\.trim\(\)\.toLowerCase\(\)===accountEmail/);
});
test('guardian links stay pending and conflicting recorded fields are rejected',()=>{
 assert.match(src,/kind:'guardian',status:'pending'/);
 assert.doesNotMatch(src,/kind:'guardian',status:'approved'/);
 assert.match(src,/student\.sourcePersonId===personId/);
 assert.match(src,/student\.sourceWebsiteRegistrationId===registrationId/);
 assert.match(src,/student\.dateOfBirth===person\.dateOfBirth/);
 assert.match(src,/new TransactWriteCommand/);
});
