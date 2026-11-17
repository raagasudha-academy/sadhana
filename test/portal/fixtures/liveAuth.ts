import { expect, type Page, test } from '@playwright/test';

export type LiveRole = 'admin' | 'teacher' | 'student';

type Credentials = { username: string; password: string };

const credentialVariables: Record<LiveRole, [string, string]> = {
  admin: ['SADHANA_TEST_USERNAME', 'SADHANA_TEST_PASSWORD'],
  teacher: ['SADHANA_TEACHER_USERNAME', 'SADHANA_TEACHER_PASSWORD'],
  student: ['SADHANA_STUDENT_USERNAME', 'SADHANA_STUDENT_PASSWORD'],
};

export function credentialsFor(role: LiveRole): Credentials | null {
  const [emailVariable, passwordVariable] = credentialVariables[role];
  const username = process.env[emailVariable]?.trim();
  const password = process.env[passwordVariable];
  return username && password ? { username, password } : null;
}

export async function signInAs(page: Page, role: LiveRole, credentials: Credentials) {
  await page.goto('/');
  await page.getByLabel(/email address|username/i).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);

  const meResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname.endsWith('/api/me');
    },
    { timeout: 45_000 },
  );
  await page.getByRole('button', { name: /^Sign in/ }).click();

  const response = await meResponse;
  expect(response.ok(), 'the authenticated /api/me request should succeed').toBeTruthy();
  const account = (await response.json()) as {
    role?: string;
    teacherInstitutions?: string[];
  };
  const hasExpectedRole =
    role === 'admin'
      ? account.role === 'admin'
      : role === 'teacher'
        ? account.role === 'viewer' && Boolean(account.teacherInstitutions?.length)
        : account.role === 'learner';
  expect(
    hasExpectedRole,
    `the supplied account should resolve to the ${role} role (resolved: ${account.role || 'unknown'})`,
  ).toBeTruthy();

  await expect(page.locator('main').last()).toBeVisible();
}

export function requireRoleCredentials(role: LiveRole): Credentials {
  const credentials = credentialsFor(role);
  test.skip(
    !credentials,
    `Set ${credentialVariables[role].join(' and ')} to run the live ${role} check.`,
  );
  return credentials!;
}
