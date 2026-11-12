import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Classes & Timetable', ({ page }) =>
  assertRolePage(page, 'admin', 'Classes & Timetable'));
test('teacher can open My Classes', ({ page }) => assertRolePage(page, 'teacher', 'My Classes'));
test('student can open My classes', ({ page }) => assertRolePage(page, 'student', 'My classes'));
test('guardian can open My classes', ({ page }) => assertRolePage(page, 'guardian', 'My classes'));
