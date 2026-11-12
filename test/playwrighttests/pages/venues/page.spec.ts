import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Venues', ({ page }) => assertRolePage(page, 'admin', 'Venues'));
test('teacher can open Venues', ({ page }) => assertRolePage(page, 'teacher', 'Venues'));
