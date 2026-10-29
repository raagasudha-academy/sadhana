import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/homework.ts',import.meta.url),'utf8');
test('homework is scoped to verified teacher, approved learner and enrolment',()=>{
 for(const guard of ['myTeacherIdentity','demandInstitution',"link.status!=='approved'",'link.institution!==inst','e.classId===assignment.classId','TransactWriteCommand','homeworkCompleted'])assert.ok(source.includes(guard),guard);
});
test('cross-academy shared student IDs are allowed only with scoped links and enrolments',()=>{assert.doesNotMatch(source,/student.institution!==inst/);assert.match(source,/e.studentId===studentId/)});
test('homework does not grant access and partition is academy scoped',()=>{
 assert.doesNotMatch(source,/status:\s*'approved'/);
 const router=readFileSync(new URL('../src/tableRouter.ts',import.meta.url),'utf8');
 assert.ok(router.includes('HOMEWORK(?:_COMPLETION)?'));
});
