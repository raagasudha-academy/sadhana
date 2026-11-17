import { expect, test } from '@playwright/test';
import { collectDiagnostics } from '../fixtures/diagnostics';

test('dev portal opens its public sign-in page', async ({ page, baseURL }) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  const response = await page.goto('/');

  expect(response?.ok(), 'the dev portal document should load').toBeTruthy();
  await expect(page.locator('body')).not.toBeEmpty();
  await diagnostics.assertHealthy();
});
