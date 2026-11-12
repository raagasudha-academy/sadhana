import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('app/src/features/learning/StudentAcademy.tsx', 'utf8');
const controller = readFileSync('app/src/features/learning/useStudentPortalController.ts', 'utf8');
const compact = (value) => value.replace(/\s+/g, '');
test('staff grouped by normalized name and role, across academies', () => {
  const code = compact(src);
  assert.match(code, /entry\.publicId\?`id:\$\{entry\.publicId\}`/);
  assert.match(code, /functiongroupAcademyStaff\(/);
  assert.match(code, /seen\.has\(identity\)/);
  assert.match(code, /current\.academies\.push\(academy\.institution\)/);
  assert.match(code, /groupAcademyStaff\(visible,role\)/);
  assert.match(code, /useState<StaffRole>\('teachers'\)/);
});
test('staff photo remains published-only and same per grouped card', () => {
  assert.match(compact(src), /if\(!current\.photoUrl&&entry\.photoUrl\)/);
  assert.match(compact(src), /photo\(person\)\?\(<img/);
  assert.match(compact(controller), /myLinkedStudents\(institution\)/);
  assert.doesNotMatch(src, /cloud\.api\.listAdministrators\(/);
});
