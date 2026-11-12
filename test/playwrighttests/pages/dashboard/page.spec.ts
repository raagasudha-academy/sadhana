import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Dashboard', ({ page }) => assertRolePage(page, 'admin', 'Dashboard'));
test('teacher can open Dashboard', ({ page }) => assertRolePage(page, 'teacher', 'Dashboard'));
test('student can open Dashboard', ({ page }) => assertRolePage(page, 'student', 'Dashboard'));
test('guardian can open Dashboard', ({ page }) => assertRolePage(page, 'guardian', 'Dashboard'));
