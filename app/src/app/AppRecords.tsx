import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  ClipboardCheck,
  GraduationCap,
  Info,
  MessageCircle,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { institutions } from '../institutions';
import { getEnrolmentStatus } from '../registry';
import { dayLabel, displayTime, pct, Pill, PageHeader, EmptyState } from './appShared';

export function CommsPage({ workspace }: any) {
  return (
    <>
      <PageHeader
        kicker="COMMUNICATIONS"
        title="Communications"
        description="A future home for WhatsApp delivery records, announcements and failed messages."
      />
      <div className="feature-grid">
        <section className="surface feature-card">
          <div className="feature-icon">
            <MessageCircle size={22} />
          </div>
          <h2>Message history</h2>
          <p>Review sent, delivered and failed messages for your institution.</p>
          <Pill>Phase 5</Pill>
        </section>
        <section className="surface feature-card">
          <div className="feature-icon">
            <CircleAlert size={22} />
          </div>
          <h2>Failed messages</h2>
          <p>Investigate failures and choose whether to resend manually.</p>
          <Pill>Phase 5</Pill>
        </section>
        <section className="surface feature-card">
          <div className="feature-icon">
            <ShieldCheck size={22} />
          </div>
          <h2>Contact preferences</h2>
          <p>Institution-specific announcement permissions and Reminder Service status.</p>
          <Pill>Phase 5</Pill>
        </section>
      </div>
      <div className="info-inline">
        <Info size={17} /> No WhatsApp messages can be sent from Sadhana at this stage. Existing
        Charu messaging is completely untouched.
      </div>
    </>
  );
}
export function SettingsPage({ workspace }: any) {
  const sections = [
    { title: 'Practice reminders', text: '7:00 PM UK default; individual overrides preserved.' },
    {
      title: 'Practice alerts',
      text: 'Low practice below 50%; missing submissions 2 expected days.',
    },
    { title: 'Attendance reminders', text: 'Exactly 24 hours before each class starts.' },
    {
      title: 'Reporting',
      text: 'Sunday 10:00 AM UK institution summary; 30 minutes before class teacher report.',
    },
    { title: 'Online classes', text: 'Links managed externally and not stored in Sadhana.' },
    { title: 'Audit history', text: 'Important changes and report exports will be logged.' },
  ];
  return (
    <>
      <PageHeader
        kicker="INSTITUTION SETTINGS"
        title={`${institutions[workspace].name} settings`}
        description="Agreed defaults, for reference in this frontend preview."
      />
      <div className="settings-grid">
        {sections.map((s) => (
          <section className="surface setting-card" key={s.title}>
            <div className="setting-icon">
              <Settings2 size={18} />
            </div>
            <strong>{s.title}</strong>
            <p>{s.text}</p>
          </section>
        ))}
      </div>
      <div className="info-inline">
        <Info size={17} /> These are descriptive placeholders. Editing and saving settings will be
        added after a secure backend is connected.
      </div>
    </>
  );
}
export function ProfileScreen({
  student,
  classItem,
  activeTab,
  setTab,
  onBack,
  enrolments,
  members,
  onEnrolFromClass,
  onEditClass,
  onDeleteClass,
  isTeacher,
  cloud,
}: any) {
  const isStudent = !!student;
  const tabs = isStudent
    ? ['Overview', 'Classes', 'Practice', 'Attendance', 'Notes']
    : ['Overview', 'Students', 'Schedule', 'Practice', 'RSVPs'];
  const item = student || classItem;
  /* v13.7.4 live calendar roster */
  const masterClassId = String(
    classItem?.classId ||
      classItem?.original?.classId ||
      (String(classItem?.id || '').startsWith('CLASS-') ? classItem.id : '') ||
      '',
  );
  const [liveRoster, setLiveRoster] = useState<any[]>([]);
  /* v13.7.5 calendar session RSVP */
  const [sessionRsvps, setSessionRsvps] = useState<any[]>([]);
  const [sessionAttendance, setSessionAttendance] = useState<any[]>([]);
  const [sessionStatusBusy, setSessionStatusBusy] = useState(false);
  const [sessionStatusError, setSessionStatusError] = useState('');
  useEffect(() => {
    if (!classItem || !cloud?.api) return;
    let active = true;
    setSessionRsvps([]);
    setSessionAttendance([]);
    setSessionStatusBusy(true);
    setSessionStatusError('');
    Promise.all([
      cloud.api.listOperations('rsvp', classItem.institution),
      cloud.api.listOperations('attendance', classItem.institution),
    ])
      .then(([rsvpResult, attendanceResult]: any[]) => {
        if (!active) return;
        setSessionRsvps(rsvpResult.records || []);
        setSessionAttendance(attendanceResult.records || []);
      })
      .catch((e: any) => {
        if (active)
          setSessionStatusError(
            e instanceof Error ? e.message : 'Unable to load session responses',
          );
      })
      .finally(() => {
        if (active) setSessionStatusBusy(false);
      });
    return () => {
      active = false;
    };
  }, [cloud?.api, classItem?.institution, classItem?.id]);

  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState('');
  useEffect(() => {
    if (!classItem || !cloud?.api) return;
    let active = true;
    setRosterBusy(true);
    setRosterError('');
    setLiveRoster([]);
    if (!masterClassId) {
      setRosterError('Calendar event has no master class link.');
      setRosterBusy(false);
      return;
    }
    Promise.all([
      cloud.api.listOperations('enrolment', classItem.institution),
      cloud.api.listOperations('student', classItem.institution),
    ])
      .then(([en, st]: any[]) => {
        if (!active) return;
        const students = new Map<string, any>(
          (st.records || []).filter((r: any) => !r.archived).map((r: any) => [r.id, r]),
        );
        const rows = (en.records || [])
          .filter(
            (e: any) => e.classId === masterClassId && !e.archived && students.has(e.studentId),
          )
          .map((e: any) => {
            const student = students.get(e.studentId);
            return {
              id: e.studentId,
              name: student.name || 'Student',
              rollNumber: student.rollNumber || '',
              status: getEnrolmentStatus(e),
            };
          });
        setLiveRoster(
          Array.from(new Map<string, any>(rows.map((r: any) => [r.id, r])).values()).sort(
            (a: any, b: any) =>
              String(a.rollNumber || a.name).localeCompare(String(b.rollNumber || b.name)),
          ),
        );
      })
      .catch((e: any) => {
        if (active) setRosterError(e instanceof Error ? e.message : 'Unable to load roster');
      })
      .finally(() => {
        if (active) setRosterBusy(false);
      });
    return () => {
      active = false;
    };
  }, [cloud?.api, classItem?.institution, masterClassId]);

  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={16} /> Back to {isStudent ? 'students' : 'classes'}
      </button>
      <PageHeader
        kicker={isStudent ? 'STUDENT PROFILE' : 'CLASS PROFILE'}
        title={item.name}
        description={
          isStudent
            ? `${item.id} · ${institutions[item.institution].name} · Institution-specific profile`
            : `${item.id} · ${institutions[item.institution].name} · ${item.teacher}`
        }
        right={
          <div className="class-toolbar-actions">
            <Pill tone={isStudent && item.status === 'Upcoming' ? 'violet' : 'green'}>
              {isStudent ? item.status : 'Regular class'}
            </Pill>
            {!isStudent && !isTeacher && (
              <>
                <button className="reg-secondary" onClick={() => onEditClass(item)}>
                  <CalendarDays size={15} /> Edit class
                </button>
                <button className="reg-danger" onClick={() => onDeleteClass(item)}>
                  <Trash2 size={15} /> Delete / archive
                </button>
              </>
            )}
          </div>
        }
      />
      <section className="surface profile-screen">
        <div className="tablist profile-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={t === activeTab}
              className={`tab ${t === activeTab ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="profile-body">
          {isStudent ? (
            <StudentTab item={item} tab={activeTab} />
          ) : (
            <ClassTab
              item={item}
              tab={activeTab}
              enrolments={enrolments}
              members={members}
              onEnrolFromClass={onEnrolFromClass}
              isTeacher={isTeacher}
              liveRoster={liveRoster}
              rosterBusy={rosterBusy}
              rosterError={rosterError}
              useLiveRoster={!!cloud?.api}
              sessionRsvps={sessionRsvps}
              sessionAttendance={sessionAttendance}
              sessionStatusBusy={sessionStatusBusy}
              sessionStatusError={sessionStatusError}
            />
          )}
        </div>
      </section>
    </>
  );
}
export function InfoRow({ name, children }: any) {
  return (
    <div className="info-row">
      <span>{name}</span>
      <strong>{children}</strong>
    </div>
  );
}
export function StudentTab({ item, tab }: any) {
  const c: any = undefined; // Teacher student profiles await the live directory.
  if (tab === 'Overview')
    return (
      <div className="profile-two">
        <div>
          <h2>Student details</h2>
          <InfoRow name="Student ID">{item.id}</InfoRow>
          <InfoRow name="Institution">{institutions[item.institution].name}</InfoRow>
          <InfoRow name="Class">{c?.name}</InfoRow>
          <InfoRow name="Status">{item.status}</InfoRow>
          <InfoRow name="Parent contact">
            {item.contact} <span className="dim">(masked)</span>
          </InfoRow>
        </div>
        <div className="profile-highlight">
          <h3>Practice snapshot</h3>
          <div className="profile-metrics">
            <div>
              <strong>{pct(item.practice)}</strong>
              <span>Practice Rate</span>
            </div>
            <div>
              <strong>{pct(item.submission)}</strong>
              <span>Submission Rate</span>
            </div>
          </div>
          <p>Practice records have not been connected.</p>
        </div>
      </div>
    );
  if (tab === 'Classes')
    return (
      <>
        <h2>Class enrolments</h2>
        <div className="detail-card">
          <GraduationCap size={18} />
          <div>
            <strong>{c?.name}</strong>
            <p>
              {dayLabel[c?.day]} · {displayTime(c?.time)} · {item.status}
            </p>
          </div>
        </div>
      </>
    );
  if (tab === 'Practice')
    return (
      <>
        <h2>Practice history</h2>
        <div className="profile-metrics larger">
          <div>
            <strong>{pct(item.practice)}</strong>
            <span>Practice Rate</span>
          </div>
          <div>
            <strong>{pct(item.submission)}</strong>
            <span>Submission Rate</span>
          </div>
          <div>
            <strong>{item.minutes} min</strong>
            <span>Logged time</span>
          </div>
        </div>
        <p className="muted">
          The detailed daily practice log will be connected after DynamoDB is ready.
        </p>
      </>
    );
  if (tab === 'Attendance')
    return (
      <>
        <h2>Attendance RSVPs</h2>
        <div className="detail-card">
          <ClipboardCheck size={18} />
          <div>
            <strong>Intended attendance</strong>
            <p>Session-by-session RSVP history will appear here after integration.</p>
          </div>
        </div>
      </>
    );
  return (
    <>
      <h2>Internal teacher notes</h2>
      <p className="muted">Only authorised institution staff will be able to view these records.</p>
      {item.notes.length ? (
        item.notes.map((n, i) => (
          <div className="note-card" key={i}>
            <div className="note-head">
              <strong>{n.by}</strong>
              <Pill>{n.status}</Pill>
            </div>
            <p>{n.text}</p>
            <span>{n.date} · note</span>
          </div>
        ))
      ) : (
        <EmptyState title="No notes" detail="Teacher notes will be created in a later phase." />
      )}
    </>
  );
}
export function ClassTab({
  item,
  tab,
  enrolments = [],
  members = [],
  onEnrolFromClass,
  isTeacher,
  liveRoster = [],
  rosterBusy = false,
  rosterError = '',
  useLiveRoster = false,
  sessionRsvps = [],
  sessionAttendance = [],
  sessionStatusBusy = false,
  sessionStatusError = '',
}: any) {
  const enrolled = enrolments
    .filter(
      (e) =>
        e.institution === item.institution &&
        e.classId === item.id &&
        getEnrolmentStatus(e) !== 'Archived',
    )
    .map((e) => ({
      id: e.studentId,
      name: members.find((m) => m.id === e.studentId)?.name || e.studentId,
      status: getEnrolmentStatus(e),
      initials: (members.find((m) => m.id === e.studentId)?.name || 'ST')
        .split(' ')
        .map((x) => x[0])
        .slice(0, 2)
        .join(''),
    }));
  const currentRoster = useLiveRoster ? liveRoster : enrolled;
  const rosterNotice = rosterBusy
    ? 'Loading current enrolments…'
    : rosterError
      ? 'Unable to load roster: ' + rosterError
      : '';
  if (tab === 'Overview')
    return (
      <div className="profile-two">
        <div>
          <h2>Class details</h2>
          <InfoRow name="Teacher">{item.teacher}</InfoRow>
          <InfoRow name="Delivery">{item.mode}</InfoRow>
          <InfoRow name="Venue">{item.venue}</InfoRow>
          <InfoRow name="Schedule">
            {dayLabel[item.day]} · {displayTime(item.time)}
          </InfoRow>
          <InfoRow name="Class dates">
            {item.startDate || 'Original schedule'} — {item.endDate || 'Ongoing'}
          </InfoRow>
          <InfoRow name="Students">
            {rosterBusy
              ? 'Loading…'
              : rosterError
                ? 'Unavailable'
                : currentRoster.length + ' enrolled'}
          </InfoRow>
        </div>
        <div className="profile-highlight">
          <h3>Class performance</h3>
          <div className="profile-metrics">
            <div>
              <strong>{item.rate == null ? '—' : `${item.rate}%`}</strong>
              <span>Practice Rate</span>
            </div>
            <div>
              <strong>{item.submission == null ? '—' : `${item.submission}%`}</strong>
              <span>Submissions</span>
            </div>
          </div>
          <p>Class performance will appear when practice data is connected.</p>
        </div>
      </div>
    );
  if (tab === 'Students')
    return (
      <>
        <div className="reg-section-head">
          <h2>Enrolled students</h2>
          {!isTeacher && String(item.id).startsWith('CLASS-') && (
            <button className="reg-primary" onClick={() => onEnrolFromClass(item.id)}>
              <Plus size={16} /> Enrol existing student
            </button>
          )}
        </div>
        {rosterNotice && <p role="status">{rosterNotice}</p>}
        <div className="profile-student-list">
          {currentRoster.map((s: any) => (
            <div key={s.id}>
              <span className="avatar avatar-small">
                {s.name
                  .split(' ')
                  .map((x: string) => x[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <strong>{s.name}</strong>
              <Pill tone={s.status === 'Upcoming' ? 'violet' : 'green'}>{s.status}</Pill>
            </div>
          ))}
        </div>
        <p className="muted">Future enrolments appear as Upcoming until their start date.</p>
      </>
    );
  if (tab === 'Schedule')
    return (
      <>
        <h2>Recurring timetable</h2>
        <div className="detail-card">
          <CalendarDays size={20} />
          <div>
            <strong>
              {dayLabel[item.day]} at {displayTime(item.time)} UK time
            </strong>
            <p>
              {item.duration} minutes · {item.mode} · {item.venue}
            </p>
          </div>
        </div>
        <p className="muted">
          Individual class exceptions, holidays and session history will be connected later.
        </p>
      </>
    );
  if (tab === 'Practice')
    return (
      <>
        <h2>Class practice</h2>
        <div className="profile-metrics larger">
          <div>
            <strong>{item.rate == null ? '—' : `${item.rate}%`}</strong>
            <span>Practice Rate</span>
          </div>
          <div>
            <strong>{item.submission == null ? '—' : `${item.submission}%`}</strong>
            <span>Submission Rate</span>
          </div>
        </div>
        <p className="muted">Student-level trends are planned for the live reports phase.</p>
      </>
    );
  const sessionId = String(item.id || '');
  const rsvpByStudent = new Map<string, any>(
    sessionRsvps
      .filter((r: any) => String(r.sessionId || '') === sessionId)
      .map((r: any) => [String(r.studentId), r]),
  );
  const markByStudent = new Map<string, any>(
    sessionAttendance
      .filter((a: any) => String(a.sessionId || '') === sessionId)
      .map((a: any) => [String(a.studentId), a]),
  );
  const displayIntention = (raw: any) =>
    raw === 'attending'
      ? 'Attending'
      : raw === 'not_attending'
        ? 'Not attending'
        : raw === 'unknown'
          ? 'Not sure'
          : 'No response';
  return (
    <>
      <h2>Session RSVPs & attendance</h2>
      <p className="muted">
        Responses and teacher-marked attendance for this dated session only. RSVP is not an
        attendance mark.
      </p>
      {sessionStatusBusy && <p role="status">Loading session responses…</p>}
      {sessionStatusError && (
        <p role="alert" className="sadhana-sync-error">
          {sessionStatusError}
        </p>
      )}
      {!sessionStatusBusy && !sessionStatusError && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roll number</th>
                <th>Student</th>
                <th>RSVP</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {currentRoster.map((st: any) => {
                const r = rsvpByStudent.get(String(st.id));
                const a = markByStudent.get(String(st.id));
                return (
                  <tr key={st.id}>
                    <td>{st.rollNumber || '—'}</td>
                    <td>{st.name}</td>
                    <td>{displayIntention(r?.intention)}</td>
                    <td>{a?.status ? String(a.status) : 'Not marked'}</td>
                  </tr>
                );
              })}
              {!currentRoster.length && (
                <tr>
                  <td colSpan={4}>
                    {rosterBusy
                      ? 'Loading enrolled students…'
                      : rosterError
                        ? 'Roster unavailable'
                        : 'No enrolled students found for this class.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// sadhana-ui-confirm-polish-20261019: consistent confirmation for session deletion.
