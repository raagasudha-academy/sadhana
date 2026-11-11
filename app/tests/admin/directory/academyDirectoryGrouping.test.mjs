import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('app/src/features/learning/StudentAcademy.tsx','utf8');
const controller=readFileSync('app/src/features/learning/useStudentPortalController.ts','utf8');
test('staff grouped by normalized name and role, across academies',()=>{
 assert.match(src,/entry\.publicId\?`id:\$\{entry\.publicId\}`/);
 assert.match(src,/function groupAcademyStaff\(/);
 assert.match(src,/seen\.has\(identity\)/);
 assert.match(src,/current\.academies\.push\(academy\.institution\)/);
 assert.match(src,/groupAcademyStaff\(visible,role\)/);
 assert.match(src,/useState<StaffRole>\('teachers'\)/);
});
test('staff photo remains published-only and same per grouped card',()=>{
 assert.match(src,/if\(!current\.photoUrl&&entry\.photoUrl\)/);
 assert.match(src,/photo\(person\)\?<img/);
 assert.match(controller,/myLinkedStudents\(institution\)/);
 assert.doesNotMatch(src,/cloud\.api\.listAdministrators\(/);
});
