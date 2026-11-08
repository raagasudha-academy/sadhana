import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const component=readFileSync('app/src/features/learning/StudentAcademy.tsx','utf8');
const controller=readFileSync('app/src/features/learning/useStudentPortalController.ts','utf8');

test('academy directory remains read-only and scoped',()=>{
 assert.ok(component.includes('ApprovedAcademiesStaffDirectory'));
 assert.ok(controller.includes('myLinkedStudents(institution)'));
 assert.ok(controller.includes('learnerAcademyDirectory(institution,approved.id)'));
});
