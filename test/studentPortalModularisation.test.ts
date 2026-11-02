import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Student portal feature boundaries', () => {
  it('keeps StudentHome as a lightweight compatibility entrypoint', () => {
    const entry = source('src/StudentHome.tsx');
    expect(entry).toContain('useStudentPortalController(props)');
    expect(entry).toContain('<StudentPortalView context={context}/>');
    expect(entry).toContain('export type LearnerPage=');
    expect(entry).not.toContain('learnerDashboard(');
  });

  it('keeps learner data loading within the controller', () => {
    const controller = source('src/features/learning/useStudentPortalController.ts');
    expect(controller).toContain('cloud.api.myLinkedStudents(');
    expect(controller).toContain('cloud.api.learnerDashboard(');
    expect(controller).toContain('cloud.api.saveLearnerRsvp(');
    expect(controller).toContain('cloud.api.saveHomeworkSubmission(');
  });

  it('keeps calendar and academy published directory in separate features', () => {
    expect(source('src/features/learning/StudentTimetable.tsx')).toContain('export function StudentCalendar');
    expect(source('src/features/learning/StudentAcademy.tsx')).toContain('export function ApprovedAcademiesStaffDirectory');
  });

  it('separates feature pages while retaining role-specific views', () => {
    const view = source('src/features/learning/StudentPortalView.tsx');
    for (const feature of [
      'FamilyDashboard', 'FamilyMembers', 'StudentCalendarPage',
      'StudentHomework', 'StudentPractice', 'StudentAttendance',
      'StudentProfile', 'StudentPrivacy', 'StudentClasses',
      'StudentTeachersPage', 'StudentVenuesPage'
    ]) expect(view).toContain(`<${feature} context={context}/>`);
  });
});
