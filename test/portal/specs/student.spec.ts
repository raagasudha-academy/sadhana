import { collectDiagnostics } from '../fixtures/diagnostics';
import {
  assertMobileNavigation,
  expectSectionHeading,
  openPrimaryPage,
} from '../fixtures/roleNavigation';
import { requireRoleCredentials, signInAs } from '../fixtures/liveAuth';
import { expect, test } from '@playwright/test';

test('student can open every learning section and nested class/learning page in dev', async ({
  page,
  baseURL,
}) => {
  const diagnostics = collectDiagnostics(page, baseURL!);
  await signInAs(page, 'student', requireRoleCredentials('student'));

  const pages: Array<[string, RegExp]> = [
    ['Dashboard', /My Learning Dashboard|Family Dashboard/i],
    ['My classes', /^My classes$/i],
    ['My learning', /^My learning$/i],
    ['My Syllabus', /^My Syllabus$/i],
    ['Messages', /^Messages$/i],
    ['My academy', /^My Academy$/i],
    ['My profile', /^My profile$/i],
  ];
  for (const [label, heading] of pages) {
    await openPrimaryPage(page, label);
    await expectSectionHeading(page, heading, `student ${label} section`);
  }

  await openPrimaryPage(page, 'My classes');
  const classSections = page.getByRole('navigation', { name: 'Section pages' });
  await expect(classSections, 'student account should load its class sub-navigation').toBeVisible();
  for (const [label, heading] of [
    ['Overview', /^My classes$/i],
    ['Timetable', /^My classes$/i],
    ['Attendance', /^My classes$/i],
    ['Venues', /^Venues$/i],
  ] as const) {
    await classSections.getByRole('button', { name: label, exact: true }).click();
    await expectSectionHeading(page, heading, `student ${label.toLowerCase()} view`);
  }

  await openPrimaryPage(page, 'My learning');
  const learningSections = page.getByRole('navigation', { name: 'Section pages' });
  await expect(learningSections).toBeVisible();
  for (const [label, heading] of [
    ['Homework', /^My learning$/i],
    ['Practice & feedback', /^My learning$/i],
  ] as const) {
    await learningSections.getByRole('button', { name: label, exact: true }).click();
    await expectSectionHeading(page, heading, `student ${label.toLowerCase()} view`);
  }

  await openPrimaryPage(page, 'My profile');
  await expectSectionHeading(page, /^My profile$/i, 'student profile');
  await expect(page.getByRole('heading', { name: 'Personal information' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contact information' })).toBeVisible();
  await expect(page.getByLabel('Display / full name')).toBeVisible();

  await assertMobileNavigation(page, 'student');
  await diagnostics.assertHealthy();
});
