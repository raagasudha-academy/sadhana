import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('app/src/features/learning/StudentAcademy.tsx','utf8');
const controller=readFileSync('app/src/features/learning/useStudentPortalController.ts','utf8');
test('staff grouped by normalized name and role, across academies',()=>{
 assert.match(src,/entry\.publicId\?`id:\$\{entry\.publicId\}`/);
 assert.match(src,/function groupPublishedStaff\(/);
 assert.match(src,/seen\.has\(identity\)/);
 assert.match(src,/current\.academies\.push\(academy\.institution\)/);
 assert.match(src,/groupPublishedStaff\(visible,'teachers'\)/);
 assert.match(src,/groupPublishedStaff\(visible,'administrators'\)/);
});
test('staff photo remains published-only and same per grouped card',()=>{
 assert.match(src,/if\(!current\.photoUrl&&entry\.photoUrl\)/);
 assert.match(src,/photo\(p\)\?<img/);
 assert.match(controller,/myLinkedStudents\(institution\)/);
 assert.doesNotMatch(src,/cloud\.api\.listAdministrators\(/);
});
