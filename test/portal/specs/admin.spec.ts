import { expect, test } from '@playwright/test';
import { collectDiagnostics } from '../fixtures/diagnostics';
import {
  expectSectionHeading,
  openAdminTab,
  openPrimaryPage,
  assertMobileNavigation,
} from '../fixtures/roleNavigation';
import { requireRoleCredentials, signInAs } from '../fixtures/liveAuth';

test('administrator can open every read-only dev section and institution scope', async ({
  page,
  baseURL,
}) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  await signInAs(page, 'admin', requireRoleCredentials('admin'));

  await openPrimaryPage(page, 'Dashboard');
  await expectSectionHeading(page, /Academy dashboard/i, 'administrator dashboard');

  await openAdminTab(page, 'People & Access', 'Families & Students');
  await expectSectionHeading(page, /All Students/i, 'student directory');
  await openAdminTab(page, 'People & Access', 'Website Registrations');
  await expectSectionHeading(page, /Website Registrations/i, 'website registration queue');
  await openAdminTab(page, 'People & Access', 'Account Access');
  await expectSectionHeading(page, /Account Access/i, 'account access requests');

  await openAdminTab(page, 'Academy Workspace', 'Classes & Timetable');
  await expectSectionHeading(page, /^Academy Calendar$/i, 'class timetable');
  await page.getByRole('tab', { name: /Master classes/ }).click();
  await expectSectionHeading(page, /^Master classes$/i, 'master class directory');
  await openAdminTab(page, 'Academy Workspace', 'Practice & Reports');
  await expectSectionHeading(page, /Practice & Reports/i, 'practice reports');
  for (const label of ['Attendance', 'Practice', 'Teacher feedback', 'RSVPs']) {
    const reportTab = page.getByRole('button', { name: new RegExp(`^${label}`) }).first();
    await expect(reportTab, `practice reports should expose ${label}`).toBeVisible();
    await reportTab.click();
    await expect(page.getByRole('heading', { name: /Class roster/i })).toBeVisible();
  }
  await openAdminTab(page, 'Academy Workspace', 'Communications');
  await expectSectionHeading(page, /Communications/i, 'communications');
  await openAdminTab(page, 'Academy Workspace', 'Settings');
  await expectSectionHeading(page, /settings/i, 'institution settings');

  const rootPages: Array<[string, RegExp]> = [
    ['Syllabus & Resources', /Syllabus & Resources/i],
    ['Messages', /^Messages$/i],
    ['Teachers', /^Teachers$/i],
    ['Venues', /Teaching venues|Venue directory/i],
    ['Administrators', /^Administrators$/i],
    ['My Profile', /^My Profile$/i],
  ];
  for (const [label, heading] of rootPages) {
    await openPrimaryPage(page, label);
    await expectSectionHeading(page, heading, `${label} section`);
  }

  const workspaceButton = page.getByRole('button', { name: 'Choose workspace' });
  await expect(workspaceButton).toBeVisible();
  await workspaceButton.click();
  const institutionGroup = page.getByRole('group', { name: 'Select an institution' });
  const institutions = await institutionGroup.getByRole('button').allTextContents();
  await workspaceButton.click();
  for (const institution of institutions.filter((label) => /Raagasudha|Śruti Vedam/i.test(label))) {
    await workspaceButton.click();
    const option = page
      .getByRole('group', { name: 'Select an institution' })
      .getByRole('button')
      .filter({ hasText: institution.trim() })
      .first();
    await option.click();
    await openPrimaryPage(page, 'Dashboard');
    await expectSectionHeading(page, /Academy dashboard/i, `${institution.trim()} dashboard`);
    if (/Raagasudha/i.test(institution)) {
      const fees = page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('button', {
          name: 'Fees',
        });
      await expect(fees).toBeVisible();
      await fees.click();
      await expectSectionHeading(page, /^Fees$/i, 'Raagasudha fees preview');
    }
  }

  await assertMobileNavigation(page, 'staff');
  await diagnostics.assertHealthy();
});
