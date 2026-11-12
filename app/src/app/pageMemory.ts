import { adminSidebarPages, adminPeopleTabs, adminWorkspaceTabs } from '../workspacePolicy';
export type ViewRole = 'admin' | 'teacher' | 'student';
const pages: Record<ViewRole, readonly string[]> = {
  admin: [...adminSidebarPages, ...adminPeopleTabs, ...adminWorkspaceTabs, 'Fees', 'My Profile'],
  teacher: [
    'Dashboard',
    'My Classes',
    'My Students',
    'Syllabus & Resources',
    'Messages',
    'Teachers',
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
};
export function pageForView(current: string, role: ViewRole, saved: string | null) {
  if (current === 'Dashboard' && saved && pages[role].includes(saved)) return saved;
  if (pages[role].includes(current)) return current;
  const equivalent =
    role === 'teacher'
      ? (
          { 'Classes & Timetable': 'My Classes', 'Families & Students': 'My Students' } as Record<
            string,
            string
          >
        )[current]
      : role === 'admin'
        ? (
            { 'My Classes': 'Classes & Timetable', 'My Students': 'Families & Students' } as Record<
              string,
              string
            >
          )[current]
        : undefined;
  if (equivalent) return equivalent;
  return saved && pages[role].includes(saved) ? saved : 'Dashboard';
}
export function savedPage(role: ViewRole) {
  try {
    return pageForView(
      '',
      role,
      sessionStorage.getItem(`sadhana:page:${role}`) || sessionStorage.getItem('sadhana:v095:page'),
    );
  } catch {
    return 'Dashboard';
  }
}
