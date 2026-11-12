import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Communications', ({ page }) =>
  assertRolePage(page, 'admin', 'Communications'));
