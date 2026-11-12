import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Families & Students', ({ page }) =>
  assertRolePage(page, 'admin', 'Families & Students'));
