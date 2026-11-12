import type { LearnerPage } from '../../StudentHome';
import {
  CalendarDays,
  NotebookPen,
  Users,
  UserRound,
  LayoutDashboard,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Check,
  MessageCircle,
  BookOpen,
} from 'lucide-react';
import AcademyBrandIcon from '../../AcademyBrandIcon';
import type { StudentPortalContext } from './useStudentPortalController';
import { StudentDashboardIntro } from './StudentDashboardIntro';
import { FamilyDashboard } from './FamilyDashboard';
import { FamilyMembers } from './FamilyMembers';
import { StudentClasses } from './StudentClasses';
import { StudentCalendarPage } from './StudentCalendarPage';
import { StudentTeachersPage } from './StudentTeachersPage';
import { StudentVenuesPage } from './StudentVenuesPage';
import { StudentProfile } from './StudentProfile';
import { StudentPrivacy } from './StudentPrivacy';
import { StudentHomework } from './StudentHomework';
import { StudentPractice } from './StudentPractice';
import SyllabusLibrary from './SyllabusLibrary';
import { StudentAttendance } from './StudentAttendance';
import MessagesPage from '../../MessagesPage';
export function StudentPortalView({ context }: { context: StudentPortalContext }) {
  const {
    cloud,
    embedded,
    page,
    selectedStudentId,
    inst,
    setInst,
    tab,
    setTab,
    navigateTo,
    sidebarOpen,
    setSidebarOpen,
    accessModalOpen,
    setAccessModalOpen,
    academyMenuOpen,
    setAcademyMenuOpen,
    students,
    activeId,
    homework,
    selectedHomework,
    submission,
    submissionBusy,
    confirmHomework,
    setConfirmHomework,
    saveAssignment,
    detailLoading,
    detail,
    date,
    loadDetail,
    rollNumber,
    setRollNumber,
    kind,
    setKind,
    requestBusy,
    message,
    error,
    setError,
    loading,
    submit,
  } = context;
  return (
    <div
      className={
        embedded
          ? 'sv1296-embedded-root student-portal-v119'
          : 'sadhana-v116-family-shell student-portal-v119 student-portal-v123 sv1291-unified'
      }
    >
      {!embedded && (
        <>
          <button
            className="sv123-mobile-menu"
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle student navigation"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />} Menu
          </button>
          <aside
            className={`sv123-sidebar ${sidebarOpen ? 'is-open' : ''}`}
            aria-label="Student portal navigation"
          >
            <div className="sv123-side-brand">
              <AcademyBrandIcon size={40} />
              <div>
                <strong>Sadhana</strong>
                <small>ACADEMY &amp; LEARNING PORTAL</small>
              </div>
            </div>
            <div className="sv1293-workspace">
              <span className="sv1293-workspace-label">WORKSPACE</span>
              <div
                className="sv1293-workspace-control"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setAcademyMenuOpen(false);
                }}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                    setAcademyMenuOpen(false);
                }}
              >
                <button
                  className="sv1293-workspace-toggle"
                  type="button"
                  aria-label="Switch academy workspace"
                  aria-haspopup="listbox"
                  aria-expanded={academyMenuOpen}
                  aria-controls="sv1293-academy-options"
                  onClick={() => setAcademyMenuOpen((v) => !v)}
                >
                  <span className="sv1293-workspace-icon">
                    <AcademyBrandIcon academy={inst} size={37} />
                  </span>
                  <span className="sv1293-workspace-copy">
                    <strong>{inst === 'raaga' ? 'Raagasudha' : 'Śruti Vedam'}</strong>
                    <small>Learning portal</small>
                  </span>
                  <ChevronDown size={19} className="sv1293-workspace-chevron" aria-hidden="true" />
                </button>
                {academyMenuOpen && (
                  <div
                    id="sv1293-academy-options"
                    role="listbox"
                    aria-label="Academy workspace"
                    className="sv1293-workspace-menu"
                  >
                    {(
                      [
                        { id: 'raaga', name: 'Raagasudha' },
                        { id: 'sruti', name: 'Śruti Vedam' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={inst === option.id}
                        className={inst === option.id ? 'selected' : ''}
                        onClick={() => {
                          setInst(option.id);
                          setAcademyMenuOpen(false);
                          setSidebarOpen(false);
                        }}
                      >
                        <AcademyBrandIcon academy={option.id} size={23} />
                        <span>{option.name}</span>
                        {inst === option.id && <Check size={16} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <nav className="sv123-side-links sv-nav-experience-v1" aria-label="Learning pages">
              {(
                [
                  { id: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
                  { id: 'teachers', label: 'My Academy', Icon: Users },
                  { id: 'classes', label: 'My classes', Icon: CalendarDays },
                  { id: 'homework', label: 'My learning', Icon: NotebookPen },
                  { id: 'resources', label: 'My Syllabus', Icon: BookOpen },
                  { id: 'messages', label: 'Messages', Icon: MessageCircle },
                  { id: 'profile', label: 'My profile', Icon: UserRound },
                ] as const
              ).map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className={
                    (link.id === 'classes'
                      ? ['classes', 'calendar', 'attendance', 'venues']
                      : link.id === 'homework'
                        ? ['homework', 'practice']
                        : link.id === 'resources'
                          ? ['resources']
                          : link.id === 'teachers'
                            ? ['teachers']
                            : link.id === 'profile'
                              ? ['profile', 'privacy']
                              : link.id === 'messages'
                                ? ['messages']
                                : ['overview']
                    ).includes(tab)
                      ? 'active'
                      : ''
                  }
                  onClick={() => {
                    setTab(link.id);
                    setSidebarOpen(false);
                    document
                      .querySelector('.sv123-main')
                      ?.scrollTo({ top: 0, behavior: 'instant' });
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                >
                  <link.Icon size={17} />
                  {link.label}
                </button>
              ))}
            </nav>
            <p className="sv123-sidebar-note">
              Only approved profiles and assigned classes are accessible.
            </p>
          </aside>
        </>
      )}
      <main className={embedded ? 'sv1296-embedded-main' : 'sv123-main'}>
        <section className={embedded ? 'sv1296-embedded-section' : 'surface access-console'}>
          {!embedded && (
            <header className="sv116-header sv1281-compact-header sv1291-topbar">
              <div className="sv1294-header-stack">
                <div className="sv1294-header-primary">
                  <button
                    className="sv1291-account"
                    type="button"
                    aria-label="Open My profile"
                    title="My profile"
                    onClick={() => {
                      setTab('profile');
                      setSidebarOpen(false);
                    }}
                    style={{
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span className="sv1291-avatar" aria-hidden="true">
                      {cloud.staff.photoUrl ? (
                        <img src={cloud.staff.photoUrl} alt="" />
                      ) : (
                        (cloud.staff.displayName?.trim()?.[0] || 'A').toUpperCase()
                      )}
                    </span>
                    <span className="sv1291-account-name">
                      {cloud.staff.displayName?.trim() || 'Account holder'}
                    </span>
                  </button>
                  {!embedded && (
                    <button
                      className="sv116-signout sv1291-signout"
                      type="button"
                      title="Sign out"
                      aria-label="Sign out"
                      onClick={() => void cloud.signOut()}
                    >
                      <LogOut size={18} />
                      <span>Sign out</span>
                    </button>
                  )}
                </div>
                <div className="sv1281-header-student">
                  {students.length > 0 && (
                    <label htmlFor="sv1281-student-select">
                      Student{' '}
                      <select
                        id="sv1281-student-select"
                        value={activeId}
                        disabled={detailLoading || !activeId}
                        onChange={(e) => {
                          if (e.target.value) void loadDetail(e.target.value);
                        }}
                      >
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.rollNumber}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            </header>
          )}
          <div className="sv116-body">
            {tab === 'overview' && <StudentDashboardIntro context={context} />}

            {students.length > 0 && (
              <div className="student-portal-learning">
                {tab !== 'overview' && tab !== 'messages' && (
                  <header className="sv1277-page-heading">
                    <span className="sv1277-page-eyebrow">YOUR ACADEMY · YOUR LEARNING</span>
                    <h1 className="sv1277-page-title">
                      {
                        (
                          {
                            classes: 'My classes',
                            calendar: 'My classes',
                            homework: 'My learning',
                            practice: 'My learning',
                            resources: 'My Syllabus',
                            attendance: 'My classes',
                            teachers: 'My Academy',
                            venues: 'Venues',
                            profile: 'My profile',
                            privacy: 'My profile',
                          } as Record<string, string>
                        )[tab]
                      }
                    </h1>
                    <p>
                      {
                        (
                          {
                            classes: 'Your active classes, teachers and upcoming schedule.',
                            calendar: 'Your approved class timetable.',
                            homework: 'Assignments and due dates for your classes.',
                            practice: 'Practice records and feedback from your teachers.',
                            resources: 'Syllabus and learning resources for this academy.',
                            attendance: 'Attendance recorded for your active classes.',
                            teachers: 'Teachers and administrators from your approved academies.',
                            venues: 'Venues available to your approved academy classes.',
                            profile: 'Your account and student profile details.',
                            privacy: 'Your privacy preferences and consents.',
                          } as Record<string, string>
                        )[tab]
                      }
                    </p>
                  </header>
                )}
                {tab !== 'overview' &&
                  tab !== 'messages' &&
                  tab !== 'teachers' &&
                  tab !== 'resources' && (
                    <nav className="sv-nav-context" aria-label="Section pages">
                      {(tab === 'classes' ||
                      tab === 'calendar' ||
                      tab === 'attendance' ||
                      tab === 'venues'
                        ? [
                            { id: 'classes', label: 'Overview' },
                            { id: 'calendar', label: 'Timetable' },
                            { id: 'attendance', label: 'Attendance' },
                            { id: 'venues', label: 'Venues' },
                          ]
                        : tab === 'homework' || tab === 'practice'
                          ? [
                              { id: 'homework', label: 'Homework' },
                              { id: 'practice', label: 'Practice & feedback' },
                            ]
                          : [
                              { id: 'profile', label: 'Profile' },
                              { id: 'privacy', label: 'Privacy' },
                            ]
                      ).map((link) => (
                        <button
                          key={link.id}
                          type="button"
                          className={tab === link.id ? 'active' : ''}
                          aria-current={tab === link.id ? 'page' : undefined}
                          onClick={() => navigateTo(link.id as LearnerPage)}
                        >
                          {link.label}
                        </button>
                      ))}
                    </nav>
                  )}
                {detailLoading && (
                  <p role="status">Loading the selected student’s learning records…</p>
                )}
                {detail && (
                  <div className="learner-workspace sv1276-learner">
                    {tab === 'overview' && <FamilyDashboard context={context} />}
                    {tab === 'classes' && <StudentClasses context={context} />}
                    {tab === 'calendar' && <StudentCalendarPage context={context} />}
                    {tab === 'teachers' && <StudentTeachersPage context={context} />}
                    {tab === 'venues' && <StudentVenuesPage context={context} />}
                    {tab === 'profile' && <StudentProfile context={context} />}
                    {tab === 'privacy' && <StudentPrivacy context={context} />}
                    {tab === 'homework' && <StudentHomework context={context} />}
                    {tab === 'practice' && <StudentPractice context={context} />}
                    {tab === 'resources' && (
                      <SyllabusLibrary
                        cloud={cloud}
                        institution={inst}
                        studentId={activeId}
                        canEdit={false}
                        showHeading={false}
                      />
                    )}
                    {tab === 'attendance' && <StudentAttendance context={context} />}
                    {tab === 'messages' &&
                      students.some(
                        (student) =>
                          student.id === activeId &&
                          (student.kind === 'student' || student.kind === 'guardian'),
                      ) && <MessagesPage cloud={cloud} workspace={inst} studentId={activeId} />}
                    {tab === 'messages' &&
                      !students.some(
                        (student) =>
                          student.id === activeId &&
                          (student.kind === 'student' || student.kind === 'guardian'),
                      ) && (
                        <p role="status">
                          Messages are available to students and approved family accounts.
                        </p>
                      )}
                  </div>
                )}
              </div>
            )}
            {tab === 'overview' && <FamilyMembers context={context} />}
            {tab === 'overview' && (accessModalOpen || (!loading && !students.length)) && (
              <div
                className="svfd-modal-backdrop"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget && !requestBusy) setAccessModalOpen(false);
                }}
              >
                <section
                  className="svfd-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="svfd-modal-heading"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && !requestBusy && students.length)
                      setAccessModalOpen(false);
                  }}
                >
                  <div className="svfd-modal-head">
                    <h2 id="svfd-modal-heading">Request student access</h2>
                    {students.length > 0 && (
                      <button
                        type="button"
                        aria-label="Close request access"
                        onClick={() => setAccessModalOpen(false)}
                        disabled={requestBusy}
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                  <p>
                    Enter the student’s academy roll number. An administrator reviews each request.
                  </p>
                  <form className="sv1275-request-form" onSubmit={(e) => void submit(e)}>
                    <label>
                      Request as{' '}
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as 'student' | 'guardian')}
                      >
                        <option value="guardian">Parent / guardian</option>
                        <option value="student">Student (self)</option>
                      </select>
                    </label>
                    <label>
                      Student roll number{' '}
                      <input
                        required
                        value={rollNumber}
                        onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. RS-006 or 001-002"
                        pattern="[0-9]{3}-[0-9]{3}|(RS|SR)-[0-9]{3,}"
                        title="Enter an academy roll number, e.g. RS-006 or 001-002"
                        autoCapitalize="characters"
                      />
                    </label>
                    <button type="submit" disabled={requestBusy}>
                      {requestBusy ? 'Submitting…' : 'Submit access request'}
                    </button>
                  </form>
                  {error && <p role="alert">{error}</p>}
                </section>
              </div>
            )}
            {confirmHomework && (
              <div
                className="sv1283-backdrop"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget && !submissionBusy) setConfirmHomework(null);
                }}
              >
                <section
                  className="sv1283-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="sv1283-title"
                  aria-describedby="sv1283-description"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && !submissionBusy) setConfirmHomework(null);
                  }}
                >
                  <div className="sv1283-icon" aria-hidden="true">
                    <NotebookPen size={25} />
                  </div>
                  <h2 id="sv1283-title">Submit homework?</h2>
                  <p id="sv1283-description">
                    Please check the details before sending your work to your teacher.
                  </p>
                  <dl>
                    <div>
                      <dt>Student</dt>
                      <dd>
                        {students.find((x) => x.id === confirmHomework.studentId)?.name ||
                          'Selected student'}{' '}
                        ·{' '}
                        {students.find((x) => x.id === confirmHomework.studentId)?.rollNumber ||
                          '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Assignment</dt>
                      <dd>
                        {homework.find((x) => x.id === confirmHomework.homeworkId)?.title ||
                          'Homework'}
                      </dd>
                    </div>
                    <div>
                      <dt>Due date</dt>
                      <dd>
                        {homework.find((x) => x.id === confirmHomework.homeworkId)?.dueDate ||
                          'Not specified'}
                      </dd>
                    </div>
                  </dl>
                  <p className="sv1283-note">
                    You can revise and resubmit until the due date (UK time).
                  </p>
                  <div className="sv1283-actions">
                    <button
                      type="button"
                      onClick={() => setConfirmHomework(null)}
                      disabled={submissionBusy}
                      autoFocus
                    >
                      Keep editing
                    </button>
                    <button
                      type="button"
                      className="sv1283-primary"
                      disabled={
                        submissionBusy ||
                        confirmHomework.studentId !== activeId ||
                        confirmHomework.homeworkId !== selectedHomework
                      }
                      onClick={() => void saveAssignment('submitted')}
                    >
                      {submissionBusy ? 'Submitting…' : 'Confirm submission'}
                    </button>
                  </div>
                </section>
              </div>
            )}
            {message && (
              <p role="status" style={{ marginTop: 12, color: '#177245' }}>
                {message}
              </p>
            )}
            {error && (
              <div role="alert" className="reg-error" style={{ marginTop: 12 }}>
                {error}
                {embedded && selectedStudentId && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      void loadDetail(selectedStudentId);
                    }}
                    style={{ marginLeft: 12 }}
                  >
                    Retry loading student
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
