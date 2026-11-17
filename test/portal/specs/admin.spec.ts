import { expect, test } from '@playwright/test';
import { collectDiagnostics } from '../fixtures/diagnostics';
import { requireRoleCredentials, signInAs } from '../fixtures/liveAuth';

test('dev portal grants the supplied account administrator access', async ({ page, baseURL }) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  await signInAs(page, 'admin', requireRoleCredentials('admin'));
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Academy dashboard' })).toBeVisible();
  await diagnostics.assertHealthy();
});
