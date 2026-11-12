import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Settings', ({ page }) => assertRolePage(page, 'admin', 'Settings'));
