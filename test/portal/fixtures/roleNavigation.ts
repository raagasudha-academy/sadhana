import { expect, type Page } from '@playwright/test';

export async function openPrimaryPage(page: Page, label: string) {
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  const item = navigation.locator('button.nav-link').filter({ hasText: label }).first();
  await expect(item, `primary navigation should expose “${label}”`).toBeVisible();
  await item.click();
}

export async function openAdminTab(page: Page, group: string, tab: string) {
  await openPrimaryPage(page, group);
  const tabItem = page.getByRole('tab', { name: tab, exact: true });
  await expect(tabItem, `the ${group} section should expose “${tab}”`).toBeVisible();
  await tabItem.click();
  await expect(tabItem).toHaveAttribute('aria-selected', 'true');
}

export async function expectSectionHeading(page: Page, expected: RegExp, description: string) {
  const main = page.locator('main').last();
  await expect(main).toBeVisible();
  await expect(
    main.getByRole('heading').filter({ hasText: expected }).first(),
    description,
  ).toBeVisible();
  await expect(page.getByText('Loading section…')).toBeHidden();
}

export async function assertMobileNavigation(page: Page, role: 'staff' | 'student') {
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation).toBeVisible();
  await navigation.locator('button.nav-link').filter({ hasText: 'Dashboard' }).click();
  await expectSectionHeading(
    page,
    role === 'student' ? /My Learning Dashboard|Family Dashboard/i : /dashboard/i,
    role === 'student' ? 'mobile learner dashboard' : 'mobile staff dashboard',
  );
}
