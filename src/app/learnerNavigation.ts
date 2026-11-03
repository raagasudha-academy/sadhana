import type { LearnerPage } from '../StudentHome';

export const learnerPageMap: Record<string, LearnerPage> = {
  Dashboard: 'overview',
  'My classes': 'classes',
  'My learning': 'homework',
  'My academy': 'teachers',
  'My profile': 'profile',
};
export const learnerSectionMap: Record<
  LearnerPage,
  string
> = {
  overview: 'Dashboard',
  classes: 'My classes',
  calendar: 'My classes',
  attendance: 'My classes',
  venues: 'My classes',
  homework: 'My learning',
  practice: 'My learning',
  teachers: 'My academy',
  profile: 'My profile',
  privacy: 'My profile',
};
