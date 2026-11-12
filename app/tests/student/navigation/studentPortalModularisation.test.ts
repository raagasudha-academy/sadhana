import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compactSource } from '../../sourceText';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Student portal feature boundaries', () => {
  it('keeps StudentHome as a lightweight compatibility entrypoint', () => {
    const entry = compactSource(source('app/src/StudentHome.tsx'));
    expect(entry).toContain('useStudentPortalController(props)');
    expect(entry).toContain(compactSource('<StudentPortalView context={context} />'));
    expect(entry).toContain('exporttypeLearnerPage=');
    expect(entry).not.toContain('learnerDashboard(');
  });

  it('keeps learner data loading within the controller', () => {
    const controller = source('app/src/features/learning/useStudentPortalController.ts');
    expect(controller).toContain('cloud.api.myLinkedStudents(');
    expect(controller).toContain('cloud.api.learnerDashboard(');
    expect(controller).toContain('cloud.api.saveLearnerRsvp(');
    expect(controller).toContain('cloud.api.saveHomeworkSubmission(');
  });

  it('keeps calendar and academy published directory in separate features', () => {
    expect(source('app/src/features/learning/StudentTimetable.tsx')).toContain(
      'export function StudentCalendar',
    );
    expect(source('app/src/features/learning/StudentAcademy.tsx')).toContain(
      'export function ApprovedAcademiesStaffDirectory',
    );
  });

  it('separates feature pages while retaining role-specific views', () => {
    const view = compactSource(source('app/src/features/learning/StudentPortalView.tsx'));
    for (const feature of [
      'FamilyDashboard',
      'FamilyMembers',
      'StudentCalendarPage',
      'StudentHomework',
      'StudentPractice',
      'StudentAttendance',
      'StudentProfile',
      'StudentPrivacy',
      'StudentClasses',
      'StudentTeachersPage',
      'StudentVenuesPage',
    ])
      expect(view).toContain(compactSource(`<${feature} context={context} />`));
  });
});
