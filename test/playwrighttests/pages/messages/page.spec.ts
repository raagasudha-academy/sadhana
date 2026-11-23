import { expect, test } from '@playwright/test';
import { openRoleSession } from '../../fixtures/rolePage';

test('teacher opens Messages from the teacher navigation', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await openRoleSession(page, 'teacher');
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Messages', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Messages' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
  await expect(page).toHaveScreenshot('teacher-messages.png', { animations: 'disabled' });
});

test('student opens Messages from the learner navigation', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await openRoleSession(page, 'student', 'no-enrollments');
  const messagesLink = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: 'Messages', exact: true });
  await expect(messagesLink).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'No active enrollments' })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
  await expect(page).toHaveScreenshot('student-no-active-enrollments.png', {
    animations: 'disabled',
  });
});
