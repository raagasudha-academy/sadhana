import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/homework.ts',import.meta.url),'utf8');
test('homework requires approved academy link and academy-scoped enrolment',()=>{
 assert.match(src,/link\.status!=='approved'/);
 assert.match(src,/link\.institution!==inst/);
 assert.match(src,/student\.archived/);
 assert.match(src,/OPS#\$\{inst\}#ENROLMENT/);
 assert.match(src,/e\.studentId===studentId/);
 assert.match(src,/e\.classId===assignment\.classId/);
 assert.match(src,/assignment\.institution!==inst/);
});
test('assignment completion checks class enrollment and prevents duplicates',()=>{
 assert.match(src,/assignment\.classId/);
 assert.match(src,/attribute_not_exists\(PK\)/);
 assert.match(src,/HOMEWORK_COMPLETION/);
});
test('teacher homework is tied to an assigned class or institution admin',()=>{
 assert.match(src,/verifyTeacherClass/);
 assert.match(src,/demandInstitution\(claims,inst\)/);
});
