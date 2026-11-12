import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('student can open My learning', ({ page }) => assertRolePage(page, 'student', 'My learning'));
test('guardian can open My learning', ({ page }) =>
  assertRolePage(page, 'guardian', 'My learning'));
