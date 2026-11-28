import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  GraduationCap,
  Info,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { institutions } from '../institutions';
import { getEnrolmentStatus } from '../registry';
import { dayLabel, displayTime, pct, Pill, PageHeader, EmptyState } from './appShared';

export function CommsPage({ workspace, cloud }: any) {
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [academyFilter, setAcademyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('60');
  const institutionName =
    workspace === 'sruti' ? 'Śruti' : workspace === 'raaga' ? 'Raaga Sudha' : 'all academies';
  const historyInstitutions = useMemo(
    () =>
      workspace === 'combined'
        ? (cloud?.staff.institutions || []).filter((id: string) => id === 'raaga' || id === 'sruti')
        : workspace === 'raaga' || workspace === 'sruti'
          ? [workspace]
          : [],
    [cloud?.staff.institutions, workspace],
  );
  const loadHistory = useCallback(async () => {
    if (!cloud?.api || historyInstitutions.length === 0) {
      setHistory([]);
      setHistoryLoaded(false);
      return;
    }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const results = await Promise.all(
        historyInstitutions.map((institution: any) =>
          cloud.api.listSwaraMitraNotificationHistory(institution, 20),
        ),
      );
      setHistory(
        results
          .flatMap((result: any) => result.records || [])
          .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 30),
      );
      setHistoryLoaded(true);
    } catch (error) {
      setHistoryLoaded(false);
      setHistoryError(
        error instanceof Error ? error.message : 'Unable to load SwaraMitra notification history.',
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [cloud?.api, historyInstitutions]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const visibleHistory = useMemo(() => {
    const cutoff = Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;
    return history.filter((item) => {
      const academyMatches = academyFilter === 'all' || item.institution === academyFilter;
      const statusMatches = statusFilter === 'all' || item.status === statusFilter;
      const timestamp = Date.parse(item.createdAt || '');
      const periodMatches = !Number.isFinite(timestamp) || timestamp >= cutoff;
      return academyMatches && statusMatches && periodMatches;
    });
  }, [academyFilter, history, periodFilter, statusFilter]);

  function statusLabel(status: string) {
    if (status === 'in-progress') return 'In progress';
    if (status === 'partial') return 'Partial';
    if (status === 'failed') return 'Failed';
    if (status === 'not-sent') return 'Not sent';
    return 'Sent';
  }

  function statusTone(status: string) {
    if (status === 'sent') return 'green';
    if (status === 'partial') return 'amber';
    if (status === 'failed' || status === 'not-sent') return 'red';
    return 'violet';
  }

  function academyLabel(institution: string) {
    return institution === 'sruti' ? 'Śruti' : 'Raaga Sudha';
  }

  function timeLabel(timestamp: string) {
    if (!timestamp) return 'Time unavailable';
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? 'Time unavailable'
      : new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
  }

  return (
    <>
      <PageHeader
        kicker="COMMUNICATIONS"
        title="Communications"
        description={`SwaraMitra WhatsApp updates for ${institutionName}.`}
        right={
          <button
            className="swara-admin-button"
            type="button"
            onClick={() => void loadHistory()}
            disabled={historyLoading || !cloud?.api}
          >
            {historyLoading ? (
              <LoaderCircle size={15} className="swara-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Refresh
          </button>
        }
      />
      <section className="surface swara-history-panel" aria-labelledby="swara-history-title">
        <div className="swara-history-service">
          <div className="swara-history-service__icon" aria-hidden="true">
            <MessageCircle size={19} />
          </div>
          <div>
            <strong>SwaraMitra WhatsApp</strong>
            <p>
              In-app notices stay on. WhatsApp uses each student's saved choice and paired number.
            </p>
          </div>
          <Pill
            tone={
              historyError ? 'red' : historyLoading ? 'violet' : historyLoaded ? 'green' : 'neutral'
            }
          >
            {historyError
              ? 'Sadhana API unavailable'
              : historyLoading
                ? 'Checking Sadhana API'
                : historyLoaded
                  ? 'Sadhana API available'
                  : 'Sign in required'}
          </Pill>
        </div>

        <div className="swara-history-heading">
          <div>
            <h2 id="swara-history-title">Recent WhatsApp updates</h2>
            <p>
              See the class message and how sending went. No student or phone details are shown.
            </p>
          </div>
          <div className="swara-history-filters" aria-label="Filter WhatsApp history">
            {workspace === 'combined' && (
              <select
                value={academyFilter}
                onChange={(event) => setAcademyFilter(event.target.value)}
                aria-label="Filter by academy"
              >
                <option value="all">All academies</option>
                {historyInstitutions.includes('raaga') && (
                  <option value="raaga">Raaga Sudha</option>
                )}
                {historyInstitutions.includes('sruti') && <option value="sruti">Śruti</option>}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by send status"
            >
              <option value="all">All statuses</option>
              <option value="sent">Sent</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
              <option value="in-progress">In progress</option>
              <option value="not-sent">Not sent</option>
            </select>
            <select
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value)}
              aria-label="Filter by date range"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
            </select>
          </div>
        </div>

        {historyError && (
          <p className="swara-history-error" role="alert">
            {historyError}
          </p>
        )}
        {!cloud?.api ? (
          <p className="swara-history-empty">
            Sign in as an academy administrator to view this history.
          </p>
        ) : historyLoading && history.length === 0 ? (
          <p className="swara-history-empty" role="status">
            Loading recent updates…
          </p>
        ) : visibleHistory.length === 0 ? (
          <p className="swara-history-empty">
            {history.length
              ? 'No updates match these filters.'
              : `No WhatsApp updates in the last ${periodFilter} days.`}
          </p>
        ) : (
          <div className="swara-history-table-wrap">
            <table className="swara-history-table">
              <thead>
                <tr>
                  <th scope="col">Class / academy</th>
                  <th scope="col">Message sent</th>
                  <th scope="col">Result</th>
                  <th scope="col">Status</th>
                  <th scope="col">Time</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((item) => (
                  <tr key={`${item.institution}:${item.requestId}`}>
                    <td>
                      <strong className="swara-history-class">
                        {item.className || item.classId}
                      </strong>
                      <span className="swara-history-academy">
                        {academyLabel(item.institution)}
                      </span>
                    </td>
                    <td className="swara-history-message">{item.message}</td>
                    <td className="swara-history-result">
                      <span>
                        <b>{item.sentCount}</b> sent
                      </span>
                      {item.failedCount > 0 && (
                        <span>
                          <b>{item.failedCount}</b> failed
                        </span>
                      )}
                      {item.queuedCount > 0 && (
                        <span>
                          <b>{item.queuedCount}</b> queued
                        </span>
                      )}
                      {item.sendingCount > 0 && (
                        <span>
                          <b>{item.sendingCount}</b> sending
                        </span>
                      )}
                      {item.notSentCount > 0 && (
                        <span>
                          <b>{item.notSentCount}</b> not sent
                        </span>
                      )}
                      <span>
                        <b>{item.recipientCount}</b> eligible
                      </span>
                    </td>
                    <td>
                      <Pill tone={statusTone(item.status)}>{statusLabel(item.status)}</Pill>
                    </td>
                    <td className="swara-history-time">
                      {timeLabel(item.updatedAt || item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visibleHistory.some((item) => item.countsMayBePartial) && (
          <p className="swara-history-warning">
            Some older delivery records were omitted from this view; counts may be partial.
          </p>
        )}
        <p className="swara-history-note">
          “Sent” means the message was accepted by the WhatsApp sender. WhatsApp delivery and read
          receipts are not available.
        </p>
      </section>
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

  const [studentSessionActivity, setStudentSessionActivity] = useState<any[]>([]);
  const [studentActivityBusy, setStudentActivityBusy] = useState(false);
  const [studentActivityError, setStudentActivityError] = useState('');
  useEffect(() => {
    if (!student || activeTab !== 'Attendance' || !cloud?.api) return;
    let active = true;
    setStudentSessionActivity([]);
    setStudentActivityBusy(true);
    setStudentActivityError('');
    Promise.all([
      cloud.api.listOperations('rsvp', student.institution),
      cloud.api.listOperations('attendance', student.institution),
      cloud.api.listSchedule(student.institution),
    ])
      .then(([rsvpResult, attendanceResult, scheduleResult]: any[]) => {
        if (!active) return;
        const rsvps = (rsvpResult.records || []).filter(
          (record: any) => String(record.studentId) === String(student.id),
        );
        const marks = (attendanceResult.records || []).filter(
          (record: any) => String(record.studentId) === String(student.id),
        );
        const relevantSessionIds = new Set(
          [...rsvps, ...marks].map((record: any) => String(record.sessionId || '')).filter(Boolean),
        );
        const schedule = scheduleResult.records || [];
        const classes = new Map(
          schedule
            .filter((record: any) => record.recordType === 'class')
            .map((record: any) => [String(record.id), record]),
        );
        const sessions = new Map(
          schedule
            .filter(
              (record: any) =>
                record.recordType === 'class-session' && relevantSessionIds.has(String(record.id)),
            )
            .map((record: any) => [String(record.id), record]),
        );
        const activity = Array.from(relevantSessionIds)
          .map((sessionId) => {
            const session: any = sessions.get(sessionId);
            const rsvp = rsvps.find((record: any) => String(record.sessionId) === sessionId);
            const attendance = marks.find((record: any) => String(record.sessionId) === sessionId);
            const classRecord: any = session ? classes.get(String(session.classId)) : null;
            return {
              sessionId,
              date: session?.date || '',
              startTime: session?.startTime || '',
              className: classRecord?.name || session?.name || '',
              rsvp: rsvp?.intention || rsvp?.response || '',
              attendance: attendance?.status || '',
            };
          })
          .sort(
            (a, b) =>
              String(b.date).localeCompare(String(a.date)) ||
              String(b.startTime).localeCompare(String(a.startTime)),
          );
        setStudentSessionActivity(activity);
      })
      .catch((e: any) => {
        if (active)
          setStudentActivityError(
            e instanceof Error ? e.message : 'Unable to load attendance and RSVP history.',
          );
      })
      .finally(() => {
        if (active) setStudentActivityBusy(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, cloud?.api, student?.id, student?.institution]);

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
            <StudentTab
              item={item}
              tab={activeTab}
              sessionActivity={studentSessionActivity}
              activityBusy={studentActivityBusy}
              activityError={studentActivityError}
            />
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
export function StudentTab({
  item,
  tab,
  sessionActivity = [],
  activityBusy = false,
  activityError = '',
}: any) {
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
        <p className="muted">Detailed daily practice logs are not available yet.</p>
      </>
    );
  if (tab === 'Attendance')
    return (
      <>
        <h2>Attendance RSVPs</h2>
        <p className="muted">Session RSVP and teacher-marked attendance are shown separately.</p>
        {activityBusy && <p role="status">Loading attendance and RSVP history…</p>}
        {activityError && (
          <p role="alert" className="sadhana-sync-error">
            {activityError}
          </p>
        )}
        {!activityBusy && !activityError && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session date</th>
                  <th>Class</th>
                  <th>RSVP</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {sessionActivity.map((record: any) => {
                  const parsedDate = record.date ? new Date(`${record.date}T12:00:00`) : null;
                  const date =
                    parsedDate && !Number.isNaN(parsedDate.getTime())
                      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(parsedDate)
                      : 'Date unavailable';
                  const rsvp =
                    record.rsvp === 'attending'
                      ? 'Attending'
                      : record.rsvp === 'not_attending'
                        ? 'Not attending'
                        : record.rsvp === 'unknown'
                          ? 'Not sure yet'
                          : 'No response';
                  const attendance = record.attendance
                    ? String(record.attendance).replace(/_/g, ' ')
                    : 'Not marked';
                  return (
                    <tr key={record.sessionId}>
                      <td>
                        {date}
                        {record.startTime ? ` · ${displayTime(record.startTime)}` : ''}
                      </td>
                      <td>{record.className || 'Class unavailable'}</td>
                      <td>{rsvp}</td>
                      <td>{attendance}</td>
                    </tr>
                  );
                })}
                {!sessionActivity.length && (
                  <tr>
                    <td colSpan={4}>No RSVP or attendance records have been recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
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
