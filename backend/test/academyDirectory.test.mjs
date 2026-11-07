import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const backend=readFileSync(new URL('../src/academyDirectory.ts',import.meta.url),'utf8');
const student=readFileSync(new URL('../../src/features/learning/StudentAcademy.tsx',import.meta.url),'utf8');
const client=readFileSync(new URL('../../src/api/sadhanaClient.ts',import.meta.url),'utf8');
test('public directory keeps allowlisted names and no private staff details',()=>{
 assert.match(backend,/publicTeacher=\(x:any\)=>\(\{name:/);
 assert.match(backend,/publicAdmin\s*=\s*\(/);
 assert.doesNotMatch(backend,/return \{\.\.\.x/);
 assert.match(backend,/adminPhotoUrl\(sub,picture\)/);
 assert.match(backend,/ownProfilePhoto\(sub\)/);
});
test('stable public identifiers are used for grouping and never publish raw sub',()=>{
 assert.match(backend,/createHash\('sha256'\)/);
 assert.match(student,/entry\.publicId\?`id:\$\{entry\.publicId\}`/);
 assert.match(client,/publicId\?:string;photoUrl\?:string/);
});
test('existing learner guard remains in lambda',()=>{
 const lambda=readFileSync(new URL('../src/routes/learningRoutes.ts',import.meta.url),'utf8');
 assert.match(lambda,/await learnerIdentity\(inst,claims,studentId\);return json\(200,await academyDirectory\(inst\)\)/);
});
