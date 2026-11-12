import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Account Access', ({ page }) =>
  assertRolePage(page, 'admin', 'Account Access'));
