import { expect, test, type Locator, type Page } from '@playwright/test';
import { openRoleSession, type PortalRole } from '../fixtures/rolePage';

const adminGroups = {
  'People & Access': ['Families & Students', 'Website Registrations', 'Account Access'],
  'Academy Workspace': ['Classes & Timetable', 'Practice & Reports', 'Communications', 'Settings'],
} as const;

const roleNavigation: Record<PortalRole, string[]> = {
  admin: [
    'Dashboard',
    'People & Access',
    'Academy Workspace',
    'Syllabus & Resources',
    'Messages',
    'Teachers',
    'Venues',
    'Administrators',
    'My Profile',
  ],
  teacher: [
    'Dashboard',
    'My Classes',
    'My Students',
    'Practice & Reports',
    'Syllabus & Resources',
    'Messages',
    'Teachers',
    'Administrators',
    'Venues',
    'My Profile',
  ],
  student: [
    'Dashboard',
    'My classes',
    'My learning',
    'My Syllabus',
    'Messages',
    'My academy',
    'My profile',
  ],
  guardian: [
    'Dashboard',
    'My classes',
    'My learning',
    'My Syllabus',
    'Messages',
    'My academy',
    'My profile',
  ],
};

const slug = (value: string) =>
  value
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function waitForPage(page: Page) {
  await expect(page.getByText('Loading section…')).toBeHidden();
  await expect(page.locator('main').last()).toBeVisible();
}

async function capture(page: Page, name: string) {
  await waitForPage(page);
  await expect(page).toHaveScreenshot(`${slug(name)}.png`, { animations: 'disabled' });
}

async function captureAndVisitTabs(
  page: Page,
  role: PortalRole,
  workspace: string,
  pageName: string,
  tabScope: Locator = page.locator('main'),
) {
  await capture(page, `${role}-${workspace}-${pageName}`);

  // Cover both ARIA tabs and the existing button-based tabs used in the
  // registration and operations screens. Admin's group tabs are handled by
  // the primary-navigation matrix below because they change the page itself.
  const tabs = tabScope.locator(
    [
      '[role="tablist"]:not(.admin-page-tabs) [role="tab"]',
      '.reg-tabs > button',
      '.ops-tabs > button',
      '.tw-tabs > button',
    ].join(', '),
  );
  const count = await tabs.count();

  for (let index = 0; index < count; index++) {
    const tab = tabs.nth(index);
    if (!(await tab.isVisible())) continue;

    const label = (await tab.innerText()).replace(/\s+/g, ' ').trim();
    if (!label) continue;

    await tab.click();
    if ((await tab.getAttribute('role')) === 'tab')
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    else await expect(tab).toHaveClass(/active/);

    const tablist = tab.locator(
      'xpath=ancestor::*[@role="tablist" or contains(@class,"reg-tabs") or contains(@class,"ops-tabs") or contains(@class,"tw-tabs")][1]',
    );
    const tablistName =
      (await tablist.getAttribute('aria-label')) ||
      (await tablist.getAttribute('class')) ||
      'section';
    await capture(page, `${role}-${workspace}-${pageName}-${tablistName}-${label}`);
  }
}

async function navButton(page: Page, label: string) {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  const button = navigation.getByRole('button', {
    name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:,|$)`),
  });
  await expect(button, `Primary navigation should include ${label}`).toBeVisible();
  return button;
}

async function assertNavigationLabels(page: Page, expected: string[]) {
  const buttons = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button');
  const actual: string[] = [];
  for (const button of await buttons.all()) {
    actual.push((await button.locator('span').first().innerText()).trim());
  }
  expect(actual).toEqual(expected);
}

async function visitAdminGroup(page: Page, workspace: string, group: keyof typeof adminGroups) {
  const button = await navButton(page, group);
  await button.click();
  const tabs = page.getByRole('tablist', { name: group }).getByRole('tab');
  await expect(tabs).toHaveCount(adminGroups[group].length);

  for (const label of adminGroups[group]) {
    const tab = page.getByRole('tablist', { name: group }).getByRole('tab', {
      name: label,
      exact: true,
    });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await captureAndVisitTabs(page, 'admin', workspace, label);
  }
}

async function visitDirectPage(page: Page, role: PortalRole, workspace: string, label: string) {
  const button = await navButton(page, label);
  await button.click();
  await captureAndVisitTabs(page, role, workspace, label);
}

async function visitRoleNavigation(page: Page, role: PortalRole, workspace: string) {
  const expected =
    role === 'admin' && workspace === 'raagasudha'
      ? [...roleNavigation.admin.slice(0, -1), 'Fees', 'My Profile']
      : roleNavigation[role];
  await assertNavigationLabels(page, expected);

  if (role === 'admin') {
    await visitDirectPage(page, role, workspace, 'Dashboard');
    await visitAdminGroup(page, workspace, 'People & Access');
    await visitAdminGroup(page, workspace, 'Academy Workspace');
    for (const label of [
      'Syllabus & Resources',
      'Messages',
      'Teachers',
      'Venues',
      'Administrators',
      'My Profile',
      ...(workspace === 'raagasudha' ? ['Fees'] : []),
    ])
      await visitDirectPage(page, role, workspace, label);
    return;
  }

  for (const label of roleNavigation[role]) await visitDirectPage(page, role, workspace, label);
}

test.describe('complete role navigation and tab visual regression', () => {
  test('administrator can open every Śruti page and tab', async ({ page }) => {
    test.setTimeout(180_000);
    await openRoleSession(page, 'admin');
    await visitRoleNavigation(page, 'admin', 'sruti');
  });

  test('administrator can open every Raagasudha page and tab', async ({ page }) => {
    test.setTimeout(180_000);
    await openRoleSession(page, 'admin');
    await page.getByRole('button', { name: 'Choose workspace' }).click();
    await page
      .getByRole('group', { name: 'Select an institution' })
      .getByRole('button')
      .filter({ hasText: 'Raagasudha' })
      .click();
    await visitRoleNavigation(page, 'admin', 'raagasudha');
  });

  test('data-backed student and class detail tabs are reachable', async ({ page }) => {
    test.setTimeout(90_000);
    await openRoleSession(page, 'admin', 'detail-tabs');

    await (await navButton(page, 'People & Access')).click();
    const peopleTabs = page.getByRole('tablist', { name: 'People & Access' });
    await peopleTabs.getByRole('tab', { name: 'Families & Students', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open student profile: Visual Fixture Student' })
      .click();
    await expect(page.locator('main .reg-tabs')).toBeVisible();
    await captureAndVisitTabs(page, 'admin', 'sruti', 'student-detail');

    await (await navButton(page, 'Academy Workspace')).click();
    const academyTabs = page.getByRole('tablist', { name: 'Academy Workspace' });
    await academyTabs.getByRole('tab', { name: 'Classes & Timetable', exact: true }).click();
    await page
      .getByRole('tablist', { name: 'My Classes sections' })
      .getByRole('tab', { name: /Master classes/ })
      .click();
    const classTile = page.getByRole('button', { name: /Visual Fixture Class/ });
    await expect(classTile).toBeVisible();
    await classTile.click();
    await expect(page.getByRole('tablist', { name: 'Class details sections' })).toBeVisible();
    await captureAndVisitTabs(
      page,
      'admin',
      'sruti',
      'class-detail',
      page.locator('.sadhana-master-editor'),
    );
  });

  for (const role of ['teacher', 'student', 'guardian'] as const) {
    test(`${role} can open every page and tab`, async ({ page }) => {
      test.setTimeout(180_000);
      await openRoleSession(page, role);
      await visitRoleNavigation(page, role, 'sruti');
    });
  }
});
