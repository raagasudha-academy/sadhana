import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Practice & Reports', ({ page }) =>
  assertRolePage(page, 'admin', 'Practice & Reports'));
