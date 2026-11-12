import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import SessionAttendanceRegister from './SessionAttendanceRegister';
import TeacherWorkspace from './TeacherWorkspace';
import type { InstitutionId } from './types';
import type { CloudSession } from './CloudAuth';
import './academyOperations.css';
import {
  visibleMasterClasses,
  visibleDatedSessions,
  eligibleStudentIds,
  enrolledStudentIds,
} from './operationsSelectors';
type Kind = 'family' | 'student' | 'enrolment' | 'attendance' | 'practice' | 'feedback' | 'rsvp';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const empty = {
  family: { parentName: '', phone: '' },
  student: { name: '', phone: '', familyId: '', adultConfirmed: false },
  enrolment: { studentId: '', classId: '', startDate: today(), endDate: '' },
  attendance: { studentId: '', sessionId: '', status: 'present', note: '' },
  practice: {
    studentId: '',
    classId: '',
    date: today(),
    didPractice: true,
    minutes: 15,
    comments: '',
  },
  feedback: { studentId: '', classId: '', date: today(), note: '' },
  rsvp: { studentId: '', sessionId: '', intention: 'attending', note: '' },
};
const labels = {
  family: 'Families',
  student: 'Students',
  enrolment: 'Enrolments',
  attendance: 'Attendance',
  practice: 'Practice',
  feedback: 'Teacher feedback',
  rsvp: 'RSVPs',
};
const reportKinds: Kind[] = ['attendance', 'practice', 'feedback', 'rsvp'];
const fields: Record<
  Kind,
  Array<{ key: string; label: string; type?: string; required?: boolean }>
> = {
  family: [
    { key: 'parentName', label: 'Parent / guardian', required: true },
    { key: 'phone', label: 'WhatsApp / telephone (+country code)', required: true },
  ],
  student: [
    { key: 'name', label: 'Student name', required: true },
    { key: 'familyId', label: 'Family (optional for adults)' },
    { key: 'phone', label: 'Student telephone' },
  ],
  enrolment: [
    { key: 'studentId', label: 'Student', required: true },
    { key: 'classId', label: 'Master class', required: true },
    { key: 'startDate', label: 'Starts', type: 'date', required: true },
    { key: 'endDate', label: 'Ends (optional)', type: 'date' },
  ],
  attendance: [
    { key: 'studentId', label: 'Student', required: true },
    { key: 'sessionId', label: 'Dated session', required: true },
    { key: 'status', label: 'Attendance', required: true },
    { key: 'note', label: 'Notes' },
  ],
  practice: [
    { key: 'studentId', label: 'Student', required: true },
    { key: 'classId', label: 'Class', required: true },
    { key: 'date', label: 'Practice date', type: 'date', required: true },
    { key: 'didPractice', label: 'Practised?', required: true },
    { key: 'minutes', label: 'Minutes', type: 'number', required: true },
    { key: 'comments', label: 'Comments' },
  ],
  feedback: [
    { key: 'studentId', label: 'Student', required: true },
    { key: 'classId', label: 'Class', required: true },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'note', label: 'Teacher feedback', required: true },
  ],
  rsvp: [
    { key: 'studentId', label: 'Student', required: true },
    { key: 'sessionId', label: 'Dated session', required: true },
    { key: 'intention', label: 'Attendance intention', required: true },
    { key: 'note', label: 'Notes' },
  ],
};
export default function AcademyOperations({
  cloud,
  workspace,
  teacherMode,
  initialArea = 'practice',
  initialStudent = '',
  initialClass = '',
}: {
  cloud?: CloudSession;
  workspace: InstitutionId;
  teacherMode: boolean;
  initialArea?: Kind;
  initialStudent?: string;
  initialClass?: string;
}) {
  const [area, setArea] = useState<Kind>(initialArea),
    [data, setData] = useState<Record<Kind, any[]>>({
      family: [],
      student: [],
      enrolment: [],
      attendance: [],
      practice: [],
      feedback: [],
      rsvp: [],
    });
  const [schedule, setSchedule] = useState<any[]>([]),
    [draft, setDraft] = useState<any>(empty[initialArea]),
    [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [showForm, setShowForm] = useState(false),
    [search, setSearch] = useState(''),
    [classFilter, setClassFilter] = useState(initialClass);
  const loadSeq = useRef(0);
  const admin = !teacherMode && cloud?.staff.role === 'admin';
  const kinds = reportKinds;
  const reload = async () => {
    if (!cloud) return;
    const seq = ++loadSeq.current;
    setBusy(true);
    setError('');
    try {
      const wanted: Kind[] = ['student', 'enrolment', ...kinds];
      const [all, cal] = await Promise.all([
        Promise.all(wanted.map((k) => cloud.api.listOperations(k, workspace))),
        cloud.api.listSchedule(workspace),
      ]);
      if (seq !== loadSeq.current) return;
      setData((prev) => ({
        ...prev,
        ...Object.fromEntries(wanted.map((k, i) => [k, all[i].records])),
      }));
      setSchedule(cal.records || []);
    } catch (e) {
      if (seq === loadSeq.current)
        setError(e instanceof Error ? e.message : 'Unable to load Sadhana records.');
    } finally {
      if (seq === loadSeq.current) setBusy(false);
    }
  };
  useEffect(() => {
    void reload();
    return () => {
      loadSeq.current++;
    };
  }, [cloud?.api, workspace, teacherMode]);
  const masters = visibleMasterClasses(schedule, data.enrolment, teacherMode);
  const sessions = visibleDatedSessions(schedule, data.enrolment, teacherMode);
  const rosterClass = masters.find((c) => c.id === classFilter);
  const roster = enrolledStudentIds(data.enrolment, classFilter);
  const summary = {
    attendance: data.attendance.length,
    present: data.attendance.filter((a) => a.status === 'present' || a.status === 'late').length,
    practice: data.practice.length,
    practiceMinutes: data.practice.reduce(
      (n, r) => n + (r.didPractice ? Number(r.minutes) || 0 : 0),
      0,
    ),
    rsvp: data.rsvp.length,
  };
  const rowClassId = (record: any) =>
    record.classId || sessions.find((session) => session.id === record.sessionId)?.classId || '';
  const rows = data[area].filter(
    (r) =>
      (!classFilter || rowClassId(r) === classFilter) &&
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  const studentName = (id: string) => data.student.find((s) => s.id === id)?.name || id;
  const className = (id: string) =>
    masters.find((c) => c.id === id)?.name || schedule.find((c) => c.id === id)?.name || id;
  const recordDetails = (record: any) =>
    area === 'practice' && record.classId && className(record.classId) === record.classId
      ? 'Class record'
      : record.classId
        ? className(record.classId)
        : record.familyId || record.phone || record.sessionId || '—';
  const open = (record: any = null) => {
    setEdit(record);
    setDraft(
      record
        ? Object.fromEntries(
            fields[area].map((f) => [f.key, record[f.key] ?? (empty[area] as any)[f.key]]),
          )
        : {
            ...empty[area],
            ...(initialStudent ? { studentId: initialStudent } : {}),
            ...(initialClass ? { classId: initialClass } : {}),
          },
    );
    setShowForm(true);
    setError('');
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloud) return;
    setBusy(true);
    setError('');
    try {
      const payload = { ...draft };
      if (area === 'student') payload.adultConfirmed = !payload.familyId;
      if (area === 'practice') payload.minutes = Number(payload.minutes);
      if (edit) await cloud.api.updateOperation(area, workspace, edit.id, payload, edit.version);
      else await cloud.api.createOperation(area, workspace, payload);
      setShowForm(false);
      setNotice(`${labels[area].slice(0, -1)} saved to DynamoDB.`);
      await reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed.';
      if (area === 'enrolment' && /changed|already ended|not found/i.test(message)) {
        await reload();
        setError(
          'This enrolment changed before it could be saved. The latest list is loaded; reopen the record and retry.',
        );
      } else setError(message);
    } finally {
      setBusy(false);
    }
  };
  const endEnrolment = async (record: any) => {
    if (
      !cloud ||
      !window.confirm(
        `End ${studentName(record.studentId)}’s enrolment in ${className(record.classId)}?`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await cloud.api.deleteEnrolment(workspace, record.id, record.version);
      setNotice('Enrolment ended.');
      await reload();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Unable to end this enrolment. Refresh and try again.';
      if (/changed|already ended|not found/i.test(message)) {
        await reload();
        setError(
          'This enrolment changed before it could be ended. The latest list is loaded; review it and retry.',
        );
      } else setError(message);
    } finally {
      setBusy(false);
    }
  };
  const field = (f: { key: string; label: string; type?: string; required?: boolean }) => {
    const v = draft[f.key] ?? '';
    let options: any[] | null = null;
    if (f.key === 'familyId')
      options = [
        { id: '', name: 'Independent adult' },
        ...data.family.map((x) => ({ id: x.id, name: x.parentName })),
      ];
    if (f.key === 'studentId') {
      const selectedSession = sessions.find((x) => x.id === draft.sessionId);
      const classId =
        area === 'enrolment'
          ? ''
          : area === 'attendance' || area === 'rsvp'
            ? selectedSession?.classId || ''
            : draft.classId || '';
      const eligible = eligibleStudentIds(
        data.enrolment,
        classId,
        area === 'attendance' || area === 'rsvp' ? selectedSession?.date : draft.date,
      );
      options = data.student
        .filter((x) => area === 'enrolment' || eligible.has(x.id))
        .map((x) => ({ id: x.id, name: x.name }));
    }
    if (f.key === 'classId') options = masters.map((x) => ({ id: x.id, name: x.name }));
    if (f.key === 'sessionId')
      options = sessions.map((x) => ({ id: x.id, name: `${x.date} · ${x.name}` }));
    if (f.key === 'intention')
      options = ['attending', 'not_attending', 'unknown'].map((x) => ({
        id: x,
        name: (
          {
            attending: 'Attending',
            not_attending: 'Not attending',
            unknown: 'No response',
          } as Record<string, string>
        )[x],
      }));
    if (f.key === 'status')
      options = ['present', 'absent', 'late', 'excused'].map((x) => ({
        id: x,
        name: x[0].toUpperCase() + x.slice(1),
      }));
    return (
      <label key={f.key} className="ops-field">
        <span>
          {f.label}
          {f.required && (v === '' || v === null || v === undefined) && <b> *</b>}
        </span>
        {typeof v === 'boolean' ? (
          <select
            value={v ? 'yes' : 'no'}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === 'yes' })}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ) : options ? (
          <select
            required={f.required}
            value={v}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
          >
            <option value="">Choose…</option>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            required={f.required}
            type={f.type || 'text'}
            value={v}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
          />
        )}
      </label>
    );
  };
  if (teacherMode)
    return <TeacherWorkspace cloud={cloud} workspace={workspace} initialArea={initialArea} />;
  return (
    <div className="ops">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {workspace === 'raaga' ? 'RAAGASUDHA' : 'ŚRUTI VEDAM'} ·{' '}
            {teacherMode ? 'TEACHER' : 'ADMINISTRATOR'}
          </div>
          <h1>{teacherMode ? 'My teaching records' : 'Practice & Reports'}</h1>
          <p>Attendance, practice, teacher feedback and class RSVPs.</p>
        </div>
        <button className="reg-secondary" disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <div className="ops-summary" aria-label="Practice and reports summary">
        <div>
          <span>Attendance marks</span>
          <strong>{summary.attendance}</strong>
        </div>
        <div>
          <span>Attendance rate</span>
          <strong>
            {summary.attendance
              ? `${Math.round((100 * summary.present) / summary.attendance)}%`
              : '—'}
          </strong>
        </div>
        <div>
          <span>Practice entries</span>
          <strong>{summary.practice}</strong>
          <small>{summary.practiceMinutes} minutes</small>
        </div>
        <div>
          <span>Teacher feedback</span>
          <strong>{data.feedback.length}</strong>
        </div>
        <div>
          <span>RSVP responses</span>
          <strong>{summary.rsvp}</strong>
        </div>
      </div>
      <section className="surface ops-panel">
        <div className="ops-tabs">
          {kinds.map((k) => (
            <button
              key={k}
              className={area === k ? 'active' : ''}
              onClick={() => {
                setArea(k);
                setShowForm(false);
                setSearch('');
              }}
            >
              {labels[k]} <small>{data[k].length}</small>
            </button>
          ))}
        </div>
        <div className="ops-toolbar">
          <input
            aria-label="Search operational records"
            placeholder={`Search ${labels[area].toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="ops-filter-field">
            Class
            <select
              aria-label="Filter by class"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {masters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!(teacherMode && area === 'attendance') && (
            <button className="reg-primary" disabled={busy} onClick={() => open()}>
              <Plus size={16} /> Add {labels[area].toLowerCase()}
            </button>
          )}
        </div>
        {teacherMode && area === 'attendance' && cloud && (
          <SessionAttendanceRegister
            cloud={cloud}
            workspace={workspace}
            schedule={schedule}
            students={data.student}
            enrolments={data.enrolment}
            attendance={data.attendance}
            onSaved={reload}
          />
        )}
        {['attendance', 'practice', 'feedback', 'rsvp'].includes(area) && (
          <div className="ops-roster" aria-label="Selected class roster">
            <div className="ops-roster-heading">
              <div>
                <h2>Class roster</h2>
                <p>
                  {rosterClass
                    ? `${roster.size} active student${roster.size === 1 ? '' : 's'}`
                    : 'Choose a class to view its active students.'}
                </p>
              </div>
              {rosterClass && <strong>{rosterClass.name}</strong>}
            </div>
            {!classFilter ? (
              <div className="ops-roster-empty">
                Select a class from the filter above to see its roster.
              </div>
            ) : (
              <ul className="ops-roster-students">
                {data.student
                  .filter((student) => roster.has(student.id))
                  .map((student) => (
                    <li key={student.id}>
                      <span>{student.name}</span>
                      <small>{student.rollNumber || ''}</small>
                    </li>
                  ))}
                {roster.size === 0 && (
                  <li className="ops-roster-empty">No active students in this class.</li>
                )}
              </ul>
            )}
          </div>
        )}
        {notice && (
          <p className="ops-notice">
            <CheckCircle2 size={16} />
            {notice}
          </p>
        )}
        {error && (
          <p className="sadhana-sync-error" role="alert">
            {error}
          </p>
        )}
        {showForm && (
          <form className="ops-form" onSubmit={save}>
            <h2>
              {edit ? 'Edit' : 'Add'} {area}
            </h2>
            <div className="ops-fields">{fields[area].map(field)}</div>
            <div className="ops-actions">
              <button type="button" className="reg-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="reg-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save to DynamoDB'}
              </button>
            </div>
          </form>
        )}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Details</th>
                <th>Status / date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name || r.parentName || studentName(r.studentId)}</strong>
                    {!teacherMode && (
                      <small className="ops-record-id" title={r.id}>
                        {r.id}
                      </small>
                    )}
                  </td>
                  <td title={area === 'practice' && r.classId ? r.classId : undefined}>
                    {recordDetails(r)}
                  </td>
                  <td>
                    {area === 'enrolment'
                      ? r.archived
                        ? 'Ended'
                        : `Active · ${r.startDate || '—'}`
                      : r.date || r.startDate || r.status || r.updatedAt?.slice(0, 10)}
                  </td>
                  <td>
                    {(admin || !['enrolment', 'family', 'student'].includes(area)) &&
                      !(teacherMode && area === 'attendance') && (
                        <div className="ops-row-actions">
                          {!(area === 'enrolment' && r.archived) && (
                            <button className="reg-secondary" onClick={() => open(r)}>
                              Edit
                            </button>
                          )}
                          {admin && area === 'enrolment' && !r.archived && (
                            <button
                              className="reg-secondary"
                              disabled={busy}
                              onClick={() => void endEnrolment(r)}
                            >
                              End enrolment
                            </button>
                          )}
                        </div>
                      )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4}>No records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
