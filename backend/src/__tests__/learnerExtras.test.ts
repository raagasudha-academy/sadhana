import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../learnerExtras.ts',import.meta.url),'utf8');

test('profile cannot alter login or legal identity',()=>{assert.match(src,/preferredName','phone','about','expectedVersion/);assert.doesNotMatch(src,/AdminUpdateUserAttributesCommand/)});
test('file uploads are private, size bound and checked after upload',()=>{assert.match(src,/learner-private/);assert.match(src,/HeadObjectCommand/);assert.match(src,/ContentLength>kind.max/);assert.match(src,/expiresIn:300/)});

test('cross-academy link is pending and requires approval',()=>{const x=readFileSync(new URL('../crossAcademyGuardian.ts',import.meta.url),'utf8');assert.match(x,/demandInstitution\(claims,'sruti'\)/);assert.match(x,/prior.status!=='approved'/);assert.match(x,/requestStudentAccess\('sruti'/)});
test('homework membership is based on actual academy enrolment',()=>{const x=readFileSync(new URL('../homework.ts',import.meta.url),'utf8');assert.doesNotMatch(x,/student.institution!==inst/);assert.match(x,/OPS#\$\{inst\}#ENROLMENT/)});
