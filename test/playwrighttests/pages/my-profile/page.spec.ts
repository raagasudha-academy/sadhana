import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('student can open My profile', ({ page }) => assertRolePage(page, 'student', 'My profile'));
test('guardian can open My profile', ({ page }) => assertRolePage(page, 'guardian', 'My profile'));
test('teacher can open My Profile', ({ page }) => assertRolePage(page, 'teacher', 'My Profile'));
test('admin can open My Profile', ({ page }) => assertRolePage(page, 'admin', 'My Profile'));
