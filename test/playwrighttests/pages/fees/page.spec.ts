import { expect, test } from '@playwright/test';
import { openRoleSession } from '../../fixtures/rolePage';

test('admin Fees are available only in the Raagasudha workspace', async ({ page }) => {
  await openRoleSession(page, 'admin');
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation.getByRole('button', { name: 'Fees', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Choose workspace' }).click();
  await page.getByRole('button', { name: 'Raagasudha' }).click();
  const feesLink = navigation.getByRole('button', { name: 'Fees', exact: true });
  await expect(feesLink).toBeVisible();
  await feesLink.click();
  await expect(page.getByRole('heading', { name: 'Fees' })).toBeVisible();

  await page.getByRole('button', { name: 'Choose workspace' }).click();
  await page.getByRole('button', { name: 'Śruti Vedam' }).click();
  await expect(navigation.getByRole('button', { name: 'Fees', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
