import { expect, test } from '@playwright/test';
import { openRoleSession } from '../../fixtures/rolePage';

test('guardian sees only the approved linked children', async ({ page }) => {
  await openRoleSession(page, 'guardian');
  await expect(page.getByText('Fixture Child One').first()).toBeVisible();
  await expect(page.getByText('Fixture Child Two').first()).toBeVisible();
});
