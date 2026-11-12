import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('student can open My academy', ({ page }) => assertRolePage(page, 'student', 'My academy'));
test('guardian can open My academy', ({ page }) => assertRolePage(page, 'guardian', 'My academy'));
