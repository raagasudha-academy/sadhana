import { expect, test } from '@playwright/test';
import { collectDiagnostics } from '../fixtures/diagnostics';

test('dev portal opens its public sign-in page', async ({ page, baseURL }) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  const response = await page.goto('/');

  expect(response?.ok(), 'the dev portal document should load').toBeTruthy();
  await expect(page.locator('body')).not.toBeEmpty();
  await expect(page.getByRole('heading', { level: 1, name: /Sign in to Sadhana/i })).toBeVisible();
  await expect(page.getByLabel(/email address/i)).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sign in/i })).toBeVisible();
  await diagnostics.assertHealthy();
});
