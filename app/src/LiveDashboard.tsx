import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  RefreshCw,
  UsersRound,
  BookOpen,
  Check,
  CalendarClock,
  X,
  MapPin,
  Clock3,
  GraduationCap,
} from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import { SwaraMitraAudience } from './app/SwaraMitraAudience';
import './academyOperations.css';
import './teacherNextClass.css';

type Snapshot = {
  institution: InstitutionId;
  students: any[];
  enrolments: any[];
  attendance: any[];
  schedule: any[];
};
type HomeworkMetric = { submitted: number; assigned: number; loading?: boolean; error?: boolean };
type RegistrationMetric = { count: number | null; more: boolean; error: boolean };
/** Live dashboard: counts are derived from persisted operations, not the old demo registry. */
export default function LiveDashboard({
  cloud,
  workspace,
  teacherMode,
  onChangePage,
}: {
  cloud: CloudSession;
  workspace: string;
  teacherMode: boolean;
  onChangePage: (page: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; rows: Snapshot[] } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<'current' | 'past'>('current');
  const [pendingByInstitution, setPendingByInstitution] = useState<
    Partial<Record<InstitutionId, RegistrationMetric>>
  >({});
  const [homeworkByInstitution, setHomeworkByInstitution] = useState<
    Partial<Record<InstitutionId, HomeworkMetric>>
  >({});
  const [teacherIds, setTeacherIds] = useState<Record<string, string[]>>({});
  const [nextActionBusy, setNextActionBusy] = useState(false);
  const [nextActionError, setNextActionError] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [rearranging, setRearranging] = useState(false);
  const [nextDate, setNextDate] = useState('');
  const [nextStart, setNextStart] = useState('');
  const [nextEnd, setNextEnd] = useState('');
  const scopes = useMemo(
    () =>
      (workspace === 'combined' ? cloud.staff.institutions : [workspace]).filter(
        (value): value is InstitutionId =>
          (value === 'raaga' || value === 'sruti') && cloud.staff.institutions.includes(value),
      ),
    [workspace, cloud.staff.institutions.join(',')],
  );
  useEffect(() => {
    let alive = true;
    if (teacherMode) {
      setPendingByInstitution({});
      return () => {
        alive = false;
      };
    }
    setPendingByInstitution(
      Object.fromEntries(
        scopes.map((institution) => [institution, { count: null, more: false, error: false }]),
      ),
    );
    Promise.all(
      scopes.map(async (institution) => {
        try {
          // Sruti uses the M9 institution-scoped directory; Raagasudha remains on
          // its existing website registration API until the controlled migration.
          const result =
            institution === 'sruti'
              ? await cloud.api.listSrutiWebsiteRegistrations()
              : await cloud.api.listWebsiteRegistrations({ status: 'pending', limit: '100' });
          const value = result as {
            registrations?: unknown[];
            records?: unknown[];
            items?: unknown[];
            data?: { registrations?: unknown[] };
            more?: boolean;
          };
          if (institution === 'sruti') {
            // Never show a misleading zero when the old Raagasudha handler responds.
            if (
              !Array.isArray(value?.records) ||
              value.records.some((row) => {
                const record = row as { institutionId?: unknown; registrationId?: unknown };
                return (
                  record?.institutionId !== 'sruti' || typeof record.registrationId !== 'string'
                );
              })
            )
              throw new Error('Unexpected Sruti registration response');
            return {
              institution,
              metric: {
                count: value.records.filter(
                  (row) => (row as { reviewStatus?: string }).reviewStatus === 'pending',
                ).length,
                more: Boolean(value.more),
                error: false,
              },
            };
          }
          const rows = Array.isArray(result)
            ? result
            : Array.isArray(value?.registrations)
              ? value.registrations
              : Array.isArray(value?.records)
                ? value.records
                : Array.isArray(value?.items)
                  ? value.items
                  : value?.data?.registrations;
          if (!Array.isArray(rows)) throw new Error('Unexpected registration response');
          return {
            institution,
            metric: { count: rows.length, more: rows.length === 100, error: false },
          };
        } catch {
          return { institution, metric: { count: null, more: false, error: true } };
        }
      }),
    ).then((results) => {
      if (alive)
        setPendingByInstitution(
          Object.fromEntries(results.map(({ institution, metric }) => [institution, metric])),
        );
    });
    return () => {
      alive = false;
    };
  }, [cloud.api, scopes, teacherMode, refresh]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError('');
    Promise.all(
      scopes.map(async (institution) => {
        const [students, enrolments, attendance, schedule] = await Promise.all([
          cloud.api.listOperations('student', institution),
          cloud.api.listOperations('enrolment', institution),
          cloud.api.listOperations('attendance', institution),
          cloud.api.listSchedule(institution),
        ]);
        return {
          institution,
          students: students.records,
          enrolments: enrolments.records,
          attendance: attendance.records,
          schedule: schedule.records,
        };
      }),
    )
      .then((rows) => {
        if (live) setLoaded({ key: scopes.join('|'), rows });
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : 'Unable to load live dashboard.');
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [cloud.api, scopes, refresh]);
  useEffect(() => {
    let live = true;
    if (!teacherMode) {
      setTeacherIds({});
      return () => {
        live = false;
      };
    }
    setTeacherIds({});
    Promise.all(
      scopes.map(async (institution) => ({
        institution,
        identity: await cloud.api.myTeacherIdentity(institution),
      })),
    )
      .then((rows) => {
        if (live)
          setTeacherIds(
            Object.fromEntries(
              rows
                .filter((x) => x.identity.linked && x.identity.teacherId)
                .map((x) => [x.institution, [String(x.identity.teacherId)]]),
            ),
          );
      })
      .catch(() => {
        if (live) setTeacherIds({});
      });
    return () => {
      live = false;
    };
  }, [cloud.api, scopes, teacherMode]);
  const currentKey = scopes.join('|');
  const data = loaded?.key === currentKey ? loaded.rows : [];
  useEffect(() => {
    let alive = true;
    if (teacherMode || data.length === 0) {
      setHomeworkByInstitution((current) => (Object.keys(current).length ? {} : current));
      return () => {
        alive = false;
      };
    }
    setHomeworkByInstitution(
      Object.fromEntries(
        scopes.map((institution) => [institution, { submitted: 0, assigned: 0, loading: true }]),
      ),
    );
    const now = new Date(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()) + 'T12:00:00Z',
    );
    now.setUTCDate(1);
    now.setUTCMonth(now.getUTCMonth() + (selectedMonth === 'current' ? 0 : -1));
    const prefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    Promise.all(
      data.map(async (scope) => {
        try {
          const classes = scope.schedule.filter(
            (record) => record.recordType === 'class' && record.lifecycleStatus !== 'archived',
          );
          const classAssignments = await Promise.all(
            classes.map(async (classRecord) => ({
              classRecord,
              records: (
                await cloud.api.listClassHomework(scope.institution, String(classRecord.id))
              ).records,
            })),
          );
          const assignments = classAssignments.flatMap(({ classRecord, records }) =>
            records
              .filter((assignment) => {
                const assignedDate = String(assignment.createdAt || assignment.dueDate || '').slice(
                  0,
                  10,
                );
                return assignedDate.startsWith(prefix);
              })
              .map((assignment) => ({ classRecord, assignment })),
          );
          const counts = await Promise.all(
            assignments.map(async ({ classRecord, assignment }) => {
              const assignedDate = String(assignment.createdAt || assignment.dueDate || '').slice(
                0,
                10,
              );
              const assignedStudents = new Set(
                scope.enrolments
                  .filter(
                    (enrolment) =>
                      enrolment.classId === classRecord.id &&
                      enrolment.institution === scope.institution &&
                      typeof enrolment.startDate === 'string' &&
                      enrolment.startDate <= assignedDate &&
                      (!enrolment.endDate || enrolment.endDate >= assignedDate),
                  )
                  .map((enrolment) => String(enrolment.studentId)),
              );
              const result = await cloud.api.teacherHomeworkSubmissions(
                scope.institution,
                String(classRecord.id),
                assignment.id,
              );
              const submittedStudents = new Set(
                result.records
                  .filter((submission) => assignedStudents.has(String(submission.studentId)))
                  .map((submission) => String(submission.studentId)),
              );
              return { assigned: assignedStudents.size, submitted: submittedStudents.size };
            }),
          );
          return {
            institution: scope.institution,
            metric: {
              assigned: counts.reduce((total, count) => total + count.assigned, 0),
              submitted: counts.reduce((total, count) => total + count.submitted, 0),
            },
          };
        } catch {
          return {
            institution: scope.institution,
            metric: { submitted: 0, assigned: 0, error: true },
          };
        }
      }),
    ).then((results) => {
      if (alive)
        setHomeworkByInstitution(
          Object.fromEntries(results.map(({ institution, metric }) => [institution, metric])),
        );
    });
    return () => {
      alive = false;
    };
  }, [cloud.api, data, scopes, selectedMonth, teacherMode]);
  const teacherNextSession = useMemo(() => {
    if (!teacherMode) return null;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const sessions = data.flatMap((scope) => {
      const ids = teacherIds[scope.institution] || [];
      const assignedClasses = new Set(
        scope.schedule
          .filter((row) => row.recordType === 'class' && ids.includes(String(row.teacherId || '')))
          .map((row) => row.id),
      );
      return scope.schedule
        .filter(
          (row) =>
            row.recordType === 'class-session' &&
            row.date &&
            row.date >= today &&
            row.status !== 'cancelled' &&
            row.institution !== 'shared' &&
            (assignedClasses.has(String(row.classId || '')) ||
              ids.includes(String(row.teacherId || ''))),
        )
        .map((row) => ({ ...row, institution: scope.institution }));
    });
    sessions.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    return sessions[0] || null;
  }, [data, teacherIds, teacherMode]);
  const confirmTeacherAttendance = async () => {
    if (
      !teacherNextSession ||
      teacherNextSession.institution === 'shared' ||
      !Number.isSafeInteger(teacherNextSession.version)
    )
      return;
    setNextActionBusy(true);
    setNextActionError('');
    try {
      await cloud.api.respondToTeacherSession(
        teacherNextSession.institution,
        teacherNextSession.id,
        Number(teacherNextSession.version),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      setNextActionError(e instanceof Error ? e.message : 'Unable to confirm attendance.');
    } finally {
      setNextActionBusy(false);
    }
  };
  const cancelTeacherSession = async () => {
    if (
      !teacherNextSession ||
      teacherNextSession.institution === 'shared' ||
      !Number.isSafeInteger(teacherNextSession.version)
    )
      return;
    setNextActionBusy(true);
    setNextActionError('');
    try {
      await cloud.api.updateSchedule(
        teacherNextSession.institution,
        teacherNextSession.id,
        { status: 'cancelled' },
        Number(teacherNextSession.version),
      );
      setCancelConfirm(false);
      setRearranging(false);
      setRefresh((x) => x + 1);
    } catch (e) {
      setNextActionError(e instanceof Error ? e.message : 'Unable to cancel this class.');
    } finally {
      setNextActionBusy(false);
    }
  };
  const rearrangeTeacherSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !teacherNextSession ||
      teacherNextSession.institution === 'shared' ||
      !Number.isSafeInteger(teacherNextSession.version)
    )
      return;
    setNextActionBusy(true);
    setNextActionError('');
    try {
      await cloud.api.updateSchedule(
        teacherNextSession.institution,
        teacherNextSession.id,
        { date: nextDate, endDate: nextDate, startTime: nextStart, endTime: nextEnd },
        Number(teacherNextSession.version),
      );
      setRearranging(false);
      setRefresh((x) => x + 1);
    } catch (e) {
      setNextActionError(e instanceof Error ? e.message : 'Unable to rearrange this class.');
    } finally {
      setNextActionBusy(false);
    }
  };
  const openRearrange = () => {
    if (!teacherNextSession) return;
    setNextDate(String(teacherNextSession.date || ''));
    setNextStart(String(teacherNextSession.startTime || ''));
    setNextEnd(String(teacherNextSession.endTime || ''));
    setRearranging(true);
    setNextActionError('');
  };
  const students = new Set(
    data.flatMap((d) =>
      d.students
        .filter((s) => !s.archived)
        .map((s) => s.id)
        .filter(Boolean),
    ),
  ).size;
  const activeEnrolments = data.reduce(
    (n, d) => n + d.enrolments.filter((e) => !e.archived).length,
    0,
  );
  const sadhanaMonthlyAttendance = (offset: number, scopesToCount = data) => {
    const londonDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const target = new Date(`${londonDate}T12:00:00Z`);
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() + offset);
    const label = target.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const prefix = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;
    // Attendance events carry sessionId, and the dated schedule is the source of session date.
    const sessionDays = new Map<string, string>();
    for (const scope of scopesToCount)
      for (const s of scope.schedule) {
        if (
          s.recordType === 'class-session' &&
          typeof s.id === 'string' &&
          typeof s.date === 'string'
        )
          sessionDays.set(`${scope.institution}:${s.id}`, s.date);
      }
    const entries = scopesToCount.flatMap((scope) =>
      scope.attendance.filter((r) => {
        const day =
          typeof r.date === 'string'
            ? r.date
            : sessionDays.get(`${scope.institution}:${r.sessionId}`);
        return (
          typeof day === 'string' &&
          day.startsWith(prefix) &&
          ['present', 'late', 'absent', 'excused'].includes(r.status)
        );
      }),
    );
    const attended = entries.filter((r) => r.status === 'present' || r.status === 'late').length;
    return {
      label,
      value: entries.length ? `${Math.round((attended * 100) / entries.length)}%` : '—',
      count: entries.length,
    };
  };
  const selectedMonthOffset = selectedMonth === 'current' ? 0 : -1;
  const thisMonth = sadhanaMonthlyAttendance(0);
  const lastMonth = sadhanaMonthlyAttendance(-1);
  const selectedMonthlyAttendance = (institution: InstitutionId) =>
    sadhanaMonthlyAttendance(
      selectedMonthOffset,
      data.filter((scope) => scope.institution === institution),
    );

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LIVE ACADEMY OVERVIEW</div>
          <h1>{teacherMode ? 'Teachers Dashboard' : 'Admin Dashboard'}</h1>
          <p>
            {workspace === 'combined'
              ? 'All authorised academies'
              : workspace === 'raaga'
                ? 'Raagasudha'
                : 'Sruti'}{' '}
            · live records
          </p>
        </div>
        <button
          type="button"
          className="reg-secondary"
          disabled={busy}
          onClick={() => setRefresh((x) => x + 1)}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="sadhana-sync-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Refreshing live academy records…</p>}
      {(!busy || data.length > 0) && (
        <>
          {teacherMode && (
            <section className="surface teacher-next-class" aria-label="My next class">
              <div className="teacher-next-class__top">
                <div className="teacher-next-class__heading">
                  <h2>
                    <CalendarDays size={19} /> My next class
                  </h2>
                  {teacherNextSession && (
                    <span className="teacher-next-class__location">
                      <MapPin size={14} />
                      {teacherNextSession.mode === 'online'
                        ? 'Online'
                        : teacherNextSession.location || 'Location to be confirmed'}
                    </span>
                  )}
                </div>
                {teacherNextSession && (
                  <div className="teacher-next-class__top-pills">
                    <span
                      className={`teacher-next-class__status ${teacherNextSession.teacherResponse === 'attending' ? 'is-confirmed' : 'is-unconfirmed'}`}
                    >
                      {teacherNextSession.teacherResponse === 'attending' ? (
                        <>
                          <Check size={13} /> Attending
                        </>
                      ) : (
                        'Needs confirmation'
                      )}
                    </span>
                    <span className="teacher-next-class__date">
                      {new Date(`${teacherNextSession.date}T12:00:00Z`).toLocaleDateString(
                        'en-GB',
                        { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
                      )}
                    </span>
                  </div>
                )}
              </div>
              {!teacherNextSession ? (
                <p className="teacher-next-class__empty">
                  {busy ? 'Loading upcoming classes…' : 'No upcoming assigned classes.'}
                </p>
              ) : (
                <>
                  <div className="teacher-next-class__class-title-row">
                    <h3>{teacherNextSession.name}</h3>
                    {!rearranging && (
                      <div className="teacher-next-class__actions">
                        <button
                          type="button"
                          className="reg-primary"
                          disabled={
                            nextActionBusy || teacherNextSession.teacherResponse === 'attending'
                          }
                          onClick={confirmTeacherAttendance}
                        >
                          <Check size={15} />
                          {teacherNextSession.teacherResponse === 'attending'
                            ? 'Attending'
                            : 'Attend'}
                        </button>
                        <button
                          type="button"
                          className="teacher-next-class__cancel"
                          disabled={nextActionBusy}
                          onClick={() => setCancelConfirm(true)}
                        >
                          <X size={15} /> Cancel class
                        </button>
                        <button
                          type="button"
                          className="reg-secondary"
                          disabled={nextActionBusy}
                          onClick={openRearrange}
                        >
                          <CalendarClock size={15} /> Rearrange
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="teacher-next-class__meta">
                    <span>
                      <Clock3 size={14} />
                      {new Date(`${teacherNextSession.date}T12:00:00Z`).toLocaleDateString(
                        'en-GB',
                        {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        },
                      )}{' '}
                      · {teacherNextSession.startTime} UK
                    </span>
                    <span>
                      {teacherNextSession.institution === 'raaga' ? 'Raagasudha' : 'Sruti'}
                    </span>
                  </p>
                  {rearranging ? (
                    <form className="teacher-next-class__form" onSubmit={rearrangeTeacherSession}>
                      <label>
                        Date
                        <input
                          type="date"
                          required
                          value={nextDate}
                          onChange={(e) => setNextDate(e.target.value)}
                        />
                      </label>
                      <label>
                        Start
                        <input
                          type="time"
                          required
                          value={nextStart}
                          onChange={(e) => setNextStart(e.target.value)}
                        />
                      </label>
                      <label>
                        End
                        <input
                          type="time"
                          required
                          value={nextEnd}
                          onChange={(e) => setNextEnd(e.target.value)}
                        />
                      </label>
                      <SwaraMitraAudience
                        cloud={cloud}
                        institution={teacherNextSession.institution}
                        classId={teacherNextSession.classId}
                      />
                      <div>
                        <button
                          type="button"
                          className="reg-secondary"
                          disabled={nextActionBusy}
                          onClick={() => setRearranging(false)}
                        >
                          Back
                        </button>
                        <button type="submit" className="reg-primary" disabled={nextActionBusy}>
                          {nextActionBusy ? 'Saving…' : 'Save new time'}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {nextActionError && !cancelConfirm && (
                    <p role="alert" className="teacher-next-class__error">
                      {nextActionError}
                    </p>
                  )}
                </>
              )}
              {cancelConfirm && teacherNextSession && (
                <div
                  className="teacher-next-class__confirm-overlay"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && !nextActionBusy) setCancelConfirm(false);
                  }}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget && !nextActionBusy)
                      setCancelConfirm(false);
                  }}
                >
                  <section
                    className="teacher-next-class__confirm"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="teacher-cancel-title"
                    aria-describedby="teacher-cancel-description"
                  >
                    <header>
                      <h2 id="teacher-cancel-title">Cancel this class?</h2>
                      <button
                        type="button"
                        aria-label="Close confirmation"
                        disabled={nextActionBusy}
                        onClick={() => setCancelConfirm(false)}
                      >
                        <X size={18} />
                      </button>
                    </header>
                    <p id="teacher-cancel-description">
                      <strong>{teacherNextSession.name}</strong> will be marked as cancelled, and
                      students will see the change.
                    </p>
                    <SwaraMitraAudience
                      cloud={cloud}
                      institution={teacherNextSession.institution}
                      classId={teacherNextSession.classId}
                    />
                    {nextActionError && (
                      <p role="alert" className="teacher-next-class__error">
                        {nextActionError}
                      </p>
                    )}
                    <footer>
                      <button
                        type="button"
                        className="reg-secondary"
                        disabled={nextActionBusy}
                        onClick={() => setCancelConfirm(false)}
                        autoFocus
                      >
                        Keep class
                      </button>
                      <button
                        type="button"
                        className="teacher-next-class__cancel-confirm"
                        disabled={nextActionBusy}
                        onClick={() => void cancelTeacherSession()}
                      >
                        {nextActionBusy ? 'Cancelling…' : 'Cancel class'}
                      </button>
                    </footer>
                  </section>
                </div>
              )}
            </section>
          )}
          {teacherMode ? (
            <div className="ops-summary" aria-label="Persisted academy statistics">
              <div>
                <span>Active enrolments</span>
                <strong>{activeEnrolments}</strong>
              </div>
              <div>
                <span>Students</span>
                <strong>{students}</strong>
              </div>
              <div>
                <span>Attendance rate</span>
                <strong>{thisMonth.value}</strong>
                <small>
                  Current month · {thisMonth.label} · {thisMonth.count} recorded
                </small>
                <strong style={{ fontSize: '1.25rem', marginTop: 8 }}>{lastMonth.value}</strong>
                <small>
                  Last month · {lastMonth.label} · {lastMonth.count} recorded
                </small>
              </div>
            </div>
          ) : (
            <>
              <div
                className="admin-home-period"
                role="group"
                aria-label="Activity reporting period"
              >
                <span>Activity period</span>
                <button
                  type="button"
                  aria-pressed={selectedMonth === 'current'}
                  className={selectedMonth === 'current' ? 'is-active' : ''}
                  onClick={() => setSelectedMonth('current')}
                >
                  Current month
                </button>
                <button
                  type="button"
                  aria-pressed={selectedMonth === 'past'}
                  className={selectedMonth === 'past' ? 'is-active' : ''}
                  onClick={() => setSelectedMonth('past')}
                >
                  Past month
                </button>
              </div>
              <section className="admin-home-metrics" aria-label="Academy overview metrics">
                <article className="admin-home-metric">
                  <h2>Active enrolments</h2>
                  <div className="admin-home-metric-values">
                    {data.map((scope) => (
                      <div className="admin-home-metric-value" key={scope.institution}>
                        <span>{scope.institution === 'raaga' ? 'Raagasudha' : 'Śruti'}</span>
                        <strong>
                          {scope.enrolments.filter((record) => !record.archived).length}
                        </strong>
                        <small>active enrolments</small>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="admin-home-metric">
                  <h2>Attendance rate</h2>
                  <div className="admin-home-metric-values">
                    {data.map((scope) => {
                      const metric = selectedMonthlyAttendance(scope.institution);
                      return (
                        <div className="admin-home-metric-value" key={scope.institution}>
                          <span>{scope.institution === 'raaga' ? 'Raagasudha' : 'Śruti'}</span>
                          <strong>{metric.value}</strong>
                          <small>
                            {metric.label} · {metric.count} recorded
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </article>
                <article className="admin-home-metric">
                  <h2>Homework submission</h2>
                  <div className="admin-home-metric-values">
                    {data.map((scope) => {
                      const metric = homeworkByInstitution[scope.institution];
                      const value = metric?.loading
                        ? '…'
                        : metric?.error
                          ? '—'
                          : metric?.assigned
                            ? `${metric.submitted}/${metric.assigned}`
                            : '—';
                      return (
                        <div className="admin-home-metric-value" key={scope.institution}>
                          <span>{scope.institution === 'raaga' ? 'Raagasudha' : 'Śruti'}</span>
                          <strong>{value}</strong>
                          <small>
                            {metric?.error
                              ? 'Unable to load assignments'
                              : metric?.assigned
                                ? `${metric.submitted} submitted · ${metric.assigned} assigned`
                                : metric?.loading
                                  ? 'Loading submissions…'
                                  : `No assignments in ${selectedMonth === 'current' ? 'current' : 'past'} month`}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </article>
                <article className="admin-home-metric">
                  <h2>Pending web registrations</h2>
                  <div className="admin-home-metric-values">
                    {data.map((scope) => {
                      const metric = pendingByInstitution[scope.institution];
                      const value = !metric
                        ? '…'
                        : metric.error
                          ? '—'
                          : metric.more || metric.count === 100
                            ? `${metric.count}+`
                            : (metric.count ?? '…');
                      return (
                        <div className="admin-home-metric-value" key={scope.institution}>
                          <span>{scope.institution === 'raaga' ? 'Raagasudha' : 'Śruti'}</span>
                          <strong>{value}</strong>
                          <small>
                            {metric?.error
                              ? 'Unable to load · refresh to retry'
                              : 'Awaiting administrator review'}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </section>
            </>
          )}
          <section className="surface" style={{ padding: 20, marginTop: 20 }}>
            <h2>Quick actions</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              <button
                className="reg-primary"
                type="button"
                onClick={() => onChangePage(teacherMode ? 'My Students' : 'Families & Students')}
              >
                <UsersRound size={16} /> {teacherMode ? 'My students' : 'Students & families'}
              </button>
              <button
                className="reg-secondary"
                type="button"
                onClick={() => onChangePage(teacherMode ? 'My Classes' : 'Classes & Timetable')}
              >
                <CalendarDays size={16} /> Timetable
              </button>
              <button
                className="reg-secondary"
                type="button"
                onClick={() => onChangePage('Student Work')}
              >
                <ClipboardCheck size={16} /> Student work
              </button>
            </div>
          </section>
          {teacherMode ? (
            data.map((d) => (
              <section
                key={d.institution}
                className="surface"
                style={{ padding: 20, marginTop: 16 }}
              >
                <h2>
                  <BookOpen
                    size={17}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }}
                  />
                  {d.institution === 'raaga' ? 'Raagasudha' : 'Sruti'}
                </h2>
                <p>
                  {new Set(d.students.filter((s) => !s.archived).map((s) => s.id)).size} active
                  students · {d.enrolments.filter((e) => !e.archived).length} active enrolments ·{' '}
                  {d.schedule.filter((s) => s.recordType === 'class').length} master classes
                </p>
              </section>
            ))
          ) : (
            <section className="surface admin-home-snapshot">
              <header>
                <div>
                  <span className="admin-home-snapshot-eyebrow">Your academy at a glance</span>
                  <h2>Academy snapshot</h2>
                </div>
                <GraduationCap size={23} aria-hidden="true" />
              </header>
              <div className="admin-home-snapshot-grid">
                {data.map((scope) => {
                  const name = scope.institution === 'raaga' ? 'Raagasudha' : 'Śruti';
                  const activeStudents = new Set(
                    scope.students
                      .filter((student) => !student.archived)
                      .map((student) => student.id),
                  ).size;
                  const classCount = scope.schedule.filter(
                    (record) =>
                      record.recordType === 'class' && record.lifecycleStatus !== 'archived',
                  ).length;
                  const homework = homeworkByInstitution[scope.institution];
                  return (
                    <article className="admin-home-snapshot-academy" key={scope.institution}>
                      <h3>{name}</h3>
                      <div className="admin-home-snapshot-stats">
                        <div>
                          <strong>{activeStudents}</strong>
                          <span>active students</span>
                        </div>
                        <div>
                          <strong>{classCount}</strong>
                          <span>master classes</span>
                        </div>
                        <div>
                          <strong>
                            {homework?.loading
                              ? '…'
                              : homework?.error
                                ? '—'
                                : homework?.assigned
                                  ? `${homework.submitted}/${homework.assigned}`
                                  : '—'}
                          </strong>
                          <span>homework submitted</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
