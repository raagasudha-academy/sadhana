import { test } from '@playwright/test';
import { assertRolePage } from '../../fixtures/rolePage';

test('teacher can open My Students', ({ page }) => assertRolePage(page, 'teacher', 'My Students'));
