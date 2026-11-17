import { expect, test } from '@playwright/test';
import { collectDiagnostics } from '../fixtures/diagnostics';
import { requireRoleCredentials, signInAs } from '../fixtures/liveAuth';

test('dev portal grants the supplied account learner access', async ({ page, baseURL }) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  await signInAs(page, 'student', requireRoleCredentials('student'));
  const navigation = page.getByRole('navigation').filter({
    has: page.getByRole('button', { name: 'My classes' }),
  });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('button', { name: 'My classes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My classes' })).toBeVisible();
  await diagnostics.assertHealthy();
});
