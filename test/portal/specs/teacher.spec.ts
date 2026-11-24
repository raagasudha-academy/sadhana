import { expect, test } from '@playwright/test';
import { collectDiagnostics } from '../fixtures/diagnostics';
import {
  assertMobileNavigation,
  expectSectionHeading,
  openPrimaryPage,
} from '../fixtures/roleNavigation';
import { requireRoleCredentials, signInAs } from '../fixtures/liveAuth';

test('teacher can open all assigned read-only and teaching sections in dev', async ({
  page,
  baseURL,
}) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  await signInAs(page, 'teacher', requireRoleCredentials('teacher'));

  const pages: Array<[string, RegExp]> = [
    ['Dashboard', /Teachers Dashboard/i],
    ['My Classes', /^Academy Calendar$/i],
    ['My Students', /My Teaching|My teaching records|All Students|My Students/i],
    ['Practice & Reports', /^My Teaching$/i],
    ['Syllabus & Resources', /Syllabus & Resources/i],
    ['Messages', /^Messages$/i],
    ['Teachers', /^Teachers$/i],
    ['Administrators', /Academy Administrators/i],
    ['Venues', /Teaching venues|Venue directory/i],
    ['My Profile', /^My Profile$/i],
  ];

  for (const [label, heading] of pages) {
    await openPrimaryPage(page, label);
    await expectSectionHeading(page, heading, `teacher ${label} section`);
    if (label === 'My Classes') {
      await page.getByRole('tab', { name: /Master classes/ }).click();
      await expectSectionHeading(page, /^Master classes$/i, 'teacher master class directory');
    }
    if (label === 'Teachers') {
      await expect(page.getByRole('button', { name: /Register Teacher/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Show Archived/i })).toBeVisible();
    }
    if (label === 'Practice & Reports') {
      const sections = page.getByRole('navigation', { name: 'My Teaching sections' });
      await expect(sections.getByRole('button', { name: 'Practice', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByText('Student practice', { exact: true })).toBeVisible();
    }
  }

  await openPrimaryPage(page, 'My Students');
  const teachingSections = page.getByRole('navigation', { name: 'My Teaching sections' });
  await expect(teachingSections).toBeVisible();
  for (const [label, heading] of [
    ['My Students', /Class students/i],
    ['Attendance', /Attendance|Session attendance register/i],
    ['Practice', /Student practice/i],
    ['Homework', /Class homework/i],
    ['History', /Attendance history/i],
  ] as const) {
    const tab = teachingSections.getByRole('button', { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expectSectionHeading(page, heading, `teacher ${label.toLowerCase()} view`);
  }

  await assertMobileNavigation(page, 'staff');
  await diagnostics.assertHealthy();
});
