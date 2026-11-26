import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('admin can open Student Work', ({ page }) => assertRolePage(page, 'admin', 'Student Work'));
