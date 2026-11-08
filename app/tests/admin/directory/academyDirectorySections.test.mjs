import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const component=readFileSync('app/src/features/learning/StudentAcademy.tsx','utf8');
const controller=readFileSync('app/src/features/learning/useStudentPortalController.ts','utf8');

test('separate teachers and administrators, labelled by academy',()=>{
 assert.match(component,/function ApprovedAcademiesStaffDirectory/);
 assert.match(component,/All Teachers/);
 assert.match(component,/All Administrators/);
 assert.match(component,/Śruti Vedam/);
 assert.match(component,/Raagasudha/);
});

test('academy content is gated by approved linked-student records',()=>{
 assert.match(controller,/myLinkedStudents\(institution\)/);
 assert.match(controller,/if\(!approved\)return null/);
 assert.match(controller,/learnerAcademyDirectory\(institution,approved.id\)/);
});

test('only published HTTPS photo URLs are displayed',()=>{
 assert.match(component,/photoUrl\?:string/);
 assert.match(component,/publicId\?:string/);
 assert.match(component,/referrerPolicy="no-referrer"/);
 assert.ok(component.includes('^https:'));
 assert.doesNotMatch(component,/listTeachers|listAdministrators|listOperations|email|phone_number/);
});
