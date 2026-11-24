import { expect, type Page } from '@playwright/test';

export async function openFamiliesAndStudents(page: Page) {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  const peopleAccess = navigation.getByRole('button', { name: 'People & Access' });
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  if (viewportWidth <= 1024 || !(await peopleAccess.isVisible()))
    await page.getByRole('button', { name: 'Toggle menu' }).click();
  await peopleAccess.click();
  const tabs = page.getByRole('tablist', { name: 'People & Access' });
  await tabs.getByRole('tab', { name: 'Families & Students', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Students' })).toBeVisible();
}
