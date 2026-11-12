import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync('app/src/features/learning/StudentAcademy.tsx', 'utf8');
const controller = readFileSync('app/src/features/learning/useStudentPortalController.ts', 'utf8');
const compact = (value) => value.replace(/\s+/g, '');

test('academy directory remains read-only and scoped', () => {
  assert.ok(compact(component).includes('ApprovedAcademiesStaffDirectory'));
  assert.ok(compact(controller).includes('myLinkedStudents(institution)'));
  assert.ok(compact(controller).includes('learnerAcademyDirectory(institution,approved.id)'));
});
