import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const homework=readFileSync(new URL('../src/homework.ts',import.meta.url),'utf8');
const router=readFileSync(new URL('../src/tableRouter.ts',import.meta.url),'utf8');
const section=(start:string,end:string)=>{
 const a=homework.indexOf(start),b=homework.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,`Expected boundaries ${start} -> ${end}`);
 return homework.slice(a,b);
};
test('guardian/student access requires explicit academy-scoped approved link',()=>{
 const code=section('async function linked(', 'async function verifyTeacherClass(');
 for(const guard of ["!claims.sub",'isStudentRecordId(studentId)', 'ACCESS#${inst}#${claims.sub}',"link.status!=='approved'",'link.institution!==inst','link.studentId!==studentId', 'student.archived'])
  assert.ok(code.includes(guard),`Missing linked-student gate: ${guard}`);
});
test('student homework listing uses scoped enrolments and release checks',()=>{
 const code=section('export async function learnerHomework(', 'export async function completeHomework(');
 for(const guard of ['linked(inst,claims,studentId)','OPS#${inst}#ENROLMENT','!e.archived','isHomeworkReleased(h)','e.classId===h.classId'])
  assert.ok(code.includes(guard),`Missing learner listing guard: ${guard}`);
});
test('assignment submission access checks linked student and enrolment',()=>{
 const code=section('async function eligibleAssignment(', 'export async function saveHomeworkSubmission(');
 for(const guard of ['linked(inst,claims,studentId)','OPS#${inst}#ENROLMENT'])
  assert.ok(code.includes(guard),`Missing assignment guard: ${guard}`);
});
test('teacher access validates identity, class ownership and academy',()=>{
 const code=section('async function verifyTeacherClass(', 'export async function publishHomework(');
 for(const guard of ['classRecord.institution!==inst','myTeacherIdentity(inst,claims)','classRecord.teacherId===teacher.teacherId','demandInstitution(claims,inst)'])
  assert.ok(code.includes(guard),`Missing teacher gate: ${guard}`);
});
test('homework data partitions remain academy scoped',()=>{
 assert.ok(homework.includes('OPS#${inst}#HOMEWORK'));
 assert.ok(router.includes('HOMEWORK'));
 assert.doesNotMatch(homework,/status:\s*'approved'/);
});
