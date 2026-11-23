import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Eye, FileText, Music2, Search } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import { visibleMasterClasses } from './operationsSelectors';
import PracticeReview from './PracticeReview';
import TeacherWorkspace from './TeacherWorkspace';
import './adminStudentWork.css';

type WorkKind = 'practice' | 'homework';
type WorkFeedback = { id: string; comment: string; createdAt?: string; audioUrl?: string };
type WorkRow = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  title: string;
  date: string;
  dueDate?: string;
  detail: string;
  status: string;
  attachmentIds?: string[];
  homeworkId?: string;
  media?: Array<{ id: string; mime: string; url: string }>;
  feedback?: WorkFeedback[];
};

const londonToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const mondayOf = (isoDate: string) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

const addDays = (isoDate: string, count: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

const previousMonthRange = () => {
  const monthStart = new Date(`${londonToday()}T12:00:00Z`);
  monthStart.setUTCDate(1);
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
  const start = monthStart.toISOString().slice(0, 10);
  const monthEnd = new Date(`${start}T12:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  return { start, end: monthEnd.toISOString().slice(0, 10) };
};

const weeksInRange = (start: string, end: string) => {
  const weeks: string[] = [];
  for (let week = mondayOf(start); week <= end; week = addDays(week, 7)) weeks.push(week);
  return weeks;
};

const fullWeekLabel = (start: string, end: string) => {
  const first = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  const firstMonth = first.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const lastMonth = last.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const year = last.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'UTC' });
  return firstMonth === lastMonth
    ? `${first.getUTCDate()}–${last.getUTCDate()} ${lastMonth} ${year}`
    : `${first.getUTCDate()} ${firstMonth}–${last.getUTCDate()} ${lastMonth} ${year}`;
};

const dayHeading = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`)
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
    .toUpperCase();

const formatWorkDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      })
    : new Date(value).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

export default function AdminStudentWork({
  cloud,
  institution,
  teacherMode = false,
}: {
  cloud: CloudSession;
  institution: InstitutionId;
  teacherMode?: boolean;
}) {
  const [kind, setKind] = useState<WorkKind>('practice');
  const [classId, setClassId] = useState('');
  const [range, setRange] = useState('this-week');
  const [homeworkTitleFilter, setHomeworkTitleFilter] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [practiceEntries, setPracticeEntries] = useState<any[]>([]);
  const [scopeData, setScopeData] = useState<{
    classes: any[];
    students: any[];
    enrolments: any[];
  } | null>(null);
  const [scopeBusy, setScopeBusy] = useState(false);
  const [mediaByRow, setMediaByRow] = useState<
    Record<string, Array<{ id: string; mime: string; url: string }>>
  >({});
  const [feedbackByRow, setFeedbackByRow] = useState<Record<string, WorkFeedback[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setScopeData(null);
    setScopeBusy(true);
    setError('');
    Promise.all([
      cloud.api.listSchedule(institution),
      cloud.api.listOperations('enrolment', institution),
      cloud.api.listOperations('student', institution),
    ])
      .then(([scheduleResult, enrolmentResult, studentResult]) => {
        if (!active) return;
        const scopedEnrolments = enrolmentResult.records || [];
        const schedule = scheduleResult.records || [];
        setScopeData({
          classes: teacherMode
            ? visibleMasterClasses(schedule, scopedEnrolments, true)
            : schedule.filter(
                (record) => record.recordType === 'class' && record.lifecycleStatus !== 'archived',
              ),
          students: studentResult.records || [],
          enrolments: scopedEnrolments,
        });
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : teacherMode
                ? 'Unable to verify your assigned classes.'
                : 'Unable to load student work.',
          );
      })
      .finally(() => {
        if (active) setScopeBusy(false);
      });
    return () => {
      active = false;
    };
  }, [cloud.api, institution, teacherMode]);
  const sourceClasses = scopeData?.classes || [];
  const sourceStudents = scopeData?.students || [];
  const sourceEnrolments = scopeData?.enrolments || [];
  const eligibleClasses = useMemo(
    () => sourceClasses.filter((c) => !c.institution || c.institution === institution),
    [sourceClasses, institution],
  );
  const studentNames = useMemo(
    () => new Map(sourceStudents.map((s) => [String(s.id), String(s.name || 'Student')])),
    [sourceStudents],
  );
  const currentWeekStart = mondayOf(londonToday());
  const previousWeekStart = addDays(currentWeekStart, -7);
  const lastMonth = useMemo(() => previousMonthRange(), []);
  const lastMonthWeeks = useMemo(() => weeksInRange(lastMonth.start, lastMonth.end), [lastMonth]);

  useEffect(() => {
    let active = true;
    if (!scopeData) return;
    setRows([]);
    setMediaByRow({});
    setFeedbackByRow({});
    setBusy(true);
    setError('');
    const load = async () => {
      try {
        if (kind === 'practice') {
          const result = await cloud.api.listOperations('practice', institution);
          const classById = new Map(eligibleClasses.map((c) => [String(c.id), c]));
          const allowedClassIds = new Set(eligibleClasses.map((c) => String(c.id)));
          const scopedPractice = (result.records || []).filter(
            (record: any) =>
              record.status !== 'Voided' &&
              (!teacherMode || allowedClassIds.has(String(record.classId || ''))),
          );
          if (active) setPracticeEntries(scopedPractice);
          const mapped = scopedPractice.map((record: any) => {
            const classRecord = classById.get(String(record.classId || ''));
            return {
              id: String(record.id || `${record.studentId}-${record.date}`),
              studentId: String(record.studentId || ''),
              studentName: studentNames.get(String(record.studentId)) || 'Student',
              classId: String(record.classId || ''),
              className: classRecord?.name || String(record.className || 'Class'),
              title: 'Practice submission',
              date: String(record.submittedAt || record.updatedAt || record.date || ''),
              detail: `${Number(record.minutes) || 0} min${record.comments ? ` · ${record.comments}` : record.topic ? ` · ${record.topic}` : ''}`,
              status: record.teacherReviewed ? 'Reviewed' : 'Submitted',
              feedback: [],
            } satisfies WorkRow;
          });
          if (active) setRows(mapped);
        } else {
          if (active) setPracticeEntries([]);
          const classAssignments = await Promise.all(
            eligibleClasses.map(async (classRecord) => {
              const result = await cloud.api.listClassHomework(institution, classRecord.id);
              return (result.records || []).map((homework: any) => ({
                classRecord,
                homework,
              }));
            }),
          );
          const submissions = await Promise.all(
            classAssignments.flatMap((assignments) =>
              assignments.map(async ({ classRecord, homework }) => {
                const result = await cloud.api.teacherHomeworkSubmissions(
                  institution,
                  classRecord.id,
                  homework.id,
                );
                const byStudent = new Map(
                  (result.records || []).map((submission: any) => [
                    String(submission.studentId),
                    submission,
                  ]),
                );
                const assignedDate = String(homework.createdAt || homework.dueDate || '').slice(
                  0,
                  10,
                );
                const assignedStudents = new Map(
                  sourceEnrolments
                    .filter(
                      (enrolment) =>
                        enrolment.classId === classRecord.id &&
                        enrolment.institution === institution &&
                        enrolment.startDate <= assignedDate &&
                        (!enrolment.endDate || enrolment.endDate >= assignedDate),
                    )
                    .map((enrolment: any) => [String(enrolment.studentId), enrolment]),
                );
                return Array.from(assignedStudents.values()).map((enrolment: any) => {
                  const submission: any = byStudent.get(String(enrolment.studentId));
                  return {
                    id: `${homework.id}:${enrolment.studentId}`,
                    studentId: String(enrolment.studentId),
                    studentName: studentNames.get(String(enrolment.studentId)) || 'Student',
                    classId: String(classRecord.id),
                    className: String(classRecord.name || 'Class'),
                    title: String(homework.title || 'Homework'),
                    date: String(
                      submission?.submittedAt ||
                        submission?.updatedAt ||
                        homework.createdAt ||
                        homework.dueDate ||
                        '',
                    ),
                    dueDate: String(homework.dueDate || ''),
                    detail: String(submission?.text || homework.instructions || 'Assigned work'),
                    status: submission
                      ? submission.reviewedAt
                        ? 'Reviewed'
                        : 'Submitted'
                      : 'Awaiting submission',
                    attachmentIds: submission?.attachmentIds || [],
                    homeworkId: String(homework.id),
                    feedback:
                      submission && (submission.feedback || submission.feedbackAudioUrl)
                        ? [
                            {
                              id: `homework-feedback:${homework.id}:${enrolment.studentId}`,
                              comment: String(submission.feedback || ''),
                              createdAt: String(submission.reviewedAt || ''),
                              ...(submission.feedbackAudioUrl
                                ? { audioUrl: String(submission.feedbackAudioUrl) }
                                : {}),
                            },
                          ]
                        : [],
                  } satisfies WorkRow;
                });
              }),
            ),
          );
          if (active)
            setRows(
              submissions
                .flat()
                .filter((row) => teacherMode || row.status !== 'Awaiting submission'),
            );
        }
      } catch (loadError) {
        if (active)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load student work.');
      } finally {
        if (active) setBusy(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    cloud.api,
    institution,
    kind,
    eligibleClasses,
    studentNames,
    sourceEnrolments,
    teacherMode,
    scopeData,
    reloadVersion,
  ]);

  const reloadWork = async () => {
    setReloadVersion((version) => version + 1);
  };

  const visibleRows = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    if (range === '4weeks') cutoff.setDate(cutoff.getDate() - 28);
    if (range === 'month') cutoff.setDate(1);
    cutoff.setHours(0, 0, 0, 0);
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => !classId || row.classId === classId)
      .filter((row) => {
        if (kind === 'practice') {
          const rowDate = row.date.slice(0, 10);
          if (range === 'all') return true;
          if (range === 'last-month') return rowDate >= lastMonth.start && rowDate <= lastMonth.end;
          const weekStart = range === 'last-week' ? previousWeekStart : currentWeekStart;
          return rowDate >= weekStart && rowDate <= addDays(weekStart, 6);
        }
        if (range === 'all') return true;
        const rowDate = row.date.slice(0, 10);
        const time = Date.parse(row.date);
        return Number.isFinite(time) && time >= cutoff.getTime() && time <= now.getTime();
      })
      .filter(
        (row) => kind !== 'homework' || !homeworkTitleFilter || row.title === homeworkTitleFilter,
      )
      .filter(
        (row) =>
          !needle ||
          `${row.studentName} ${row.className} ${row.title}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''));
  }, [
    rows,
    classId,
    range,
    query,
    kind,
    homeworkTitleFilter,
    currentWeekStart,
    previousWeekStart,
    lastMonth,
  ]);
  const shownRows = visibleRows.slice(0, limit);
  const homeworkTitles = useMemo(
    () =>
      [...new Set(rows.map((row) => row.title).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const mapWeekStarts = useMemo(() => {
    if (range === 'this-week') return [currentWeekStart];
    if (range === 'last-week') return [previousWeekStart];
    if (range === 'last-month') return [...lastMonthWeeks].reverse();
    const weeks = new Set([currentWeekStart]);
    for (const entry of practiceEntries) {
      const date = String(entry.date || entry.practiceDate || entry.practiceDateKey || '').slice(
        0,
        10,
      );
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) weeks.add(mondayOf(date));
    }
    return [...weeks].sort((a, b) => b.localeCompare(a));
  }, [range, currentWeekStart, previousWeekStart, lastMonthWeeks, practiceEntries]);
  const practiceMaps = useMemo(
    () =>
      mapWeekStarts.map((mapWeekStart) => {
        const mapWeekEnd = addDays(mapWeekStart, 6);
        const activeClassIds = new Set(eligibleClasses.map((record) => String(record.id)));
        const studentById = new Map(sourceStudents.map((student) => [String(student.id), student]));
        const students = new Map<string, { name: string; rollNumber: string; minutes: number[] }>();
        for (const enrolment of sourceEnrolments) {
          const enrolledClass = String(enrolment.classId || '');
          const studentId = String(enrolment.studentId || '');
          if (
            !studentId ||
            !activeClassIds.has(enrolledClass) ||
            (classId && enrolledClass !== classId) ||
            enrolment.institution !== institution ||
            enrolment.archived === true ||
            enrolment.status === 'archived' ||
            (enrolment.startDate && enrolment.startDate > mapWeekEnd) ||
            (enrolment.endDate && enrolment.endDate < mapWeekStart)
          )
            continue;
          const student = studentById.get(studentId);
          const name = String(student?.name || studentNames.get(studentId) || 'Student');
          const rollNumber = String(student?.rollNumber || '');
          if (!students.has(studentId))
            students.set(studentId, {
              name,
              rollNumber,
              minutes: Array.from({ length: 7 }, () => 0),
            });
        }

        for (const entry of practiceEntries) {
          const studentId = String(entry.studentId || '');
          const entryClassId = String(entry.classId || '');
          const date = String(
            entry.date || entry.practiceDate || entry.practiceDateKey || '',
          ).slice(0, 10);
          const inLastMonth = date >= lastMonth.start && date <= lastMonth.end;
          if (
            !students.has(studentId) ||
            (classId && entryClassId !== classId) ||
            !activeClassIds.has(entryClassId) ||
            date < mapWeekStart ||
            date > mapWeekEnd ||
            (range === 'last-month' && !inLastMonth) ||
            entry.didPractice === false
          )
            continue;
          const dayIndex = Math.round(
            (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${mapWeekStart}T12:00:00Z`)) / 86400000,
          );
          if (dayIndex >= 0 && dayIndex < 7)
            students.get(studentId)!.minutes[dayIndex] += Math.max(0, Number(entry.minutes) || 0);
        }

        const needle = query.trim().toLowerCase();
        const rows = [...students.entries()]
          .map(([id, student]) => ({
            id,
            ...student,
            practicedDays: student.minutes.filter((minutes) => minutes > 0).length,
          }))
          .filter(
            (student) =>
              !needle || `${student.name} ${student.rollNumber}`.toLowerCase().includes(needle),
          )
          .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
        return { start: mapWeekStart, end: mapWeekEnd, rows };
      }),
    [
      mapWeekStarts,
      eligibleClasses,
      sourceStudents,
      sourceEnrolments,
      practiceEntries,
      classId,
      institution,
      range,
      lastMonth,
      studentNames,
      query,
    ],
  );

  useEffect(() => {
    setLimit(12);
  }, [classId, range, query, kind, homeworkTitleFilter]);

  useEffect(() => {
    let active = true;
    const visible = shownRows;
    if (!visible.length) return;
    void Promise.all(
      visible.map(async (row) => {
        const mediaRequest =
          kind === 'homework' && !row.attachmentIds?.length
            ? Promise.resolve([])
            : kind === 'practice'
              ? cloud.api
                  .teacherPracticeMedia(institution, row.id)
                  .then((result) => result.records || [])
                  .catch(() => [])
              : cloud.api
                  .teacherHomeworkEvidenceLinks(
                    institution,
                    row.classId,
                    row.homeworkId || row.id.split(':')[0],
                    row.studentId,
                  )
                  .then((result) => result.records || [])
                  .catch(() => []);
        const feedbackRequest =
          kind === 'practice'
            ? cloud.api
                .teacherPracticeComments(institution, row.id)
                .then((result) => result.records || [])
                .catch(() => [])
            : Promise.resolve(row.feedback || []);
        const [media, feedback] = await Promise.all([mediaRequest, feedbackRequest]);
        return { id: row.id, media, feedback };
      }),
    ).then((mediaRows) => {
      if (!active) return;
      setMediaByRow((current) => ({
        ...current,
        ...Object.fromEntries(mediaRows.map(({ id, media }) => [id, media])),
      }));
      setFeedbackByRow((current) => ({
        ...current,
        ...Object.fromEntries(mediaRows.map(({ id, feedback }) => [id, feedback])),
      }));
    });
    return () => {
      active = false;
    };
  }, [cloud.api, institution, kind, shownRows.map((row) => row.id).join('|')]);

  return (
    <section className="admin-student-work">
      <header className="asw-heading">
        <div>
          <p className="eyebrow">
            {institution.toUpperCase()} · {teacherMode ? 'TEACHER' : 'ADMINISTRATOR'}
          </p>
          <h1>Student work</h1>
          <p>
            {teacherMode
              ? 'Review practice and homework submissions for your assigned classes.'
              : 'Review practice and homework submissions by class.'}
          </p>
        </div>
        {!teacherMode && (
          <span className="asw-read-only">
            <Eye size={16} /> Read-only review
          </span>
        )}
      </header>
      <div className="asw-tabs" role="tablist" aria-label="Student work type">
        {(['practice', 'homework'] as WorkKind[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            className={kind === value ? 'active' : ''}
            onClick={() => {
              setKind(value);
              setRange(value === 'practice' ? 'this-week' : '4weeks');
              setHomeworkTitleFilter('');
            }}
          >
            {value === 'practice' ? 'Practice' : 'Homework'}
          </button>
        ))}
      </div>
      <div className={`asw-filters${kind === 'homework' ? ' asw-filters--homework' : ''}`}>
        <label>
          Class
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">All classes</option>
            {eligibleClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {kind === 'practice' ? 'Week' : 'Date range'}
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {kind === 'practice' ? (
              <>
                <option value="this-week">This week</option>
                <option value="last-week">Last week</option>
                <option value="last-month">Last month</option>
                <option value="all">All weeks</option>
              </>
            ) : (
              <>
                <option value="4weeks">Last 4 weeks</option>
                <option value="month">This month</option>
                <option value="all">All time</option>
              </>
            )}
          </select>
        </label>
        {kind === 'homework' && (
          <label>
            Homework title
            <select
              value={homeworkTitleFilter}
              onChange={(event) => setHomeworkTitleFilter(event.target.value)}
            >
              <option value="">All homework</option>
              {homeworkTitles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="asw-search">
          Search student
          <span>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or class"
            />
          </span>
        </label>
      </div>
      {kind === 'practice' && (
        <div className="asw-practice-maps">
          {practiceMaps.map(({ start, end, rows: mapRows }) => (
            <section
              className="asw-practice-map"
              key={start}
              aria-label={`Weekly practice map, ${fullWeekLabel(start, end)}`}
            >
              <header className="asw-practice-map-heading">
                <div>
                  <h2>Weekly practice consistency</h2>
                  <p>
                    Recorded practice minutes for each enrolled student ·{' '}
                    {fullWeekLabel(start, end)}
                  </p>
                </div>
                <div className="asw-practice-legend" aria-label="Practice minutes per day legend">
                  <span className="asw-practice-legend-title">MINUTES PER DAY</span>
                  <span>
                    <i className="asw-practice-level-0" />
                    None
                  </span>
                  <span>
                    <i className="asw-practice-level-1" />
                    1–14
                  </span>
                  <span>
                    <i className="asw-practice-level-2" />
                    15–29
                  </span>
                  <span>
                    <i className="asw-practice-level-3" />
                    30+
                  </span>
                </div>
              </header>
              {mapRows.length ? (
                <div className="asw-practice-map-scroll">
                  <table className="asw-practice-map-table">
                    <thead>
                      <tr>
                        <th scope="col" className="asw-practice-student-column">
                          Student
                        </th>
                        {Array.from({ length: 7 }, (_, index) => {
                          const date = addDays(start, index);
                          return (
                            <th scope="col" key={date}>
                              {dayHeading(date)}
                            </th>
                          );
                        })}
                        <th scope="col" className="asw-practice-total-column">
                          Total days <span>(5-day goal)</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapRows.map((student) => (
                        <tr key={student.id}>
                          <th scope="row" className="asw-practice-student-column">
                            <span>{student.name}</span>
                            {student.rollNumber && <small>{student.rollNumber}</small>}
                          </th>
                          {student.minutes.map((minutes, index) => {
                            const date = addDays(start, index);
                            const inSelectedMonth =
                              range !== 'last-month' ||
                              (date >= lastMonth.start && date <= lastMonth.end);
                            const level =
                              minutes >= 30 ? 3 : minutes >= 15 ? 2 : minutes > 0 ? 1 : 0;
                            const label = inSelectedMonth
                              ? `${dayHeading(date)}: ${minutes ? `${minutes} minutes` : 'no recorded practice'}`
                              : `${dayHeading(date)}: outside last month`;
                            return (
                              <td key={date}>
                                <span
                                  className={`asw-practice-cell asw-practice-level-${level}${inSelectedMonth ? '' : ' asw-practice-day-outside'}`}
                                  title={label}
                                  aria-label={label}
                                >
                                  {inSelectedMonth && minutes ? `${minutes} min` : '—'}
                                </span>
                              </td>
                            );
                          })}
                          <td className="asw-practice-total-column">
                            <strong
                              aria-label={`${student.practicedDays} practice days out of a 5-day weekly goal`}
                            >
                              {student.practicedDays}/5 days
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="asw-practice-map-empty">
                  {scopeBusy || busy
                    ? 'Loading weekly practice…'
                    : 'No enrolled students or practice entries match this week.'}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
      {error && (
        <p className="asw-error" role="alert">
          {error}
        </p>
      )}
      {teacherMode &&
        kind === 'homework' &&
        (classId ? (
          <section className="asw-teacher-tools">
            <h2>
              Assign or manage homework ·{' '}
              {eligibleClasses.find((c) => c.id === classId)?.name || 'Selected class'}
            </h2>
            <TeacherWorkspace
              cloud={cloud}
              workspace={institution}
              initialArea="homework"
              initialClass={classId}
              workOnly
            />
          </section>
        ) : (
          <p className="asw-empty">Choose a class above to assign or manage its homework.</p>
        ))}
      {(busy || scopeBusy) && (
        <p className="asw-empty" role="status">
          Loading submissions…
        </p>
      )}
      {!busy && !error && visibleRows.length === 0 && (
        <p className="asw-empty">No student work matches these filters.</p>
      )}
      <div className="asw-list">
        {shownRows.map((row) => {
          const attachments = mediaByRow[row.id] || row.media || [];
          const feedback = feedbackByRow[row.id] || row.feedback || [];
          const renderMedia = (media: { id: string; mime: string; url: string }) => {
            if (media.mime.startsWith('audio/'))
              return (
                <div className="asw-media-preview asw-audio" key={media.id}>
                  <Music2 size={18} />
                  <audio
                    controls
                    preload="none"
                    src={media.url}
                    aria-label={`Audio submission from ${row.studentName}`}
                  />
                </div>
              );
            if (media.mime.startsWith('video/'))
              return (
                <video
                  className="asw-video-preview"
                  key={media.id}
                  controls
                  preload="metadata"
                  aria-label={`Video submission from ${row.studentName}`}
                >
                  <source src={media.url} type={media.mime} />
                  Your browser cannot play this video.
                </video>
              );
            if (media.mime.startsWith('image/'))
              return (
                <a
                  className="asw-image-preview-link"
                  key={media.id}
                  href={media.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open image submission from ${row.studentName}`}
                >
                  <img
                    className="asw-image-preview"
                    src={media.url}
                    alt={`Submission from ${row.studentName}`}
                    loading="lazy"
                  />
                </a>
              );
            return (
              <a
                className="asw-file"
                key={media.id}
                href={media.url}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={15} /> Open attachment
              </a>
            );
          };

          if (!teacherMode)
            return (
              <article className="asw-card asw-card--admin" key={row.id}>
                <div className="asw-admin-student">
                  <h2>{row.studentName}</h2>
                  <p>{row.className}</p>
                  <small>{row.title}</small>
                </div>
                <div className="asw-admin-date">
                  <span>Date</span>
                  <time>{row.date ? formatWorkDate(row.date) : 'Date unavailable'}</time>
                </div>
                <div className="asw-admin-submitted-media">
                  <span>Submitted media</span>
                  {attachments.length ? (
                    <div className="asw-admin-media-grid">{attachments.map(renderMedia)}</div>
                  ) : (
                    <p className="asw-admin-no-media">No media uploaded</p>
                  )}
                  {row.detail && <p className="asw-detail">{row.detail}</p>}
                </div>
                <div className="asw-admin-status">
                  <span>Status</span>
                  <strong>{row.status}</strong>
                </div>
                <div className="asw-admin-feedback">
                  <span>Teacher feedback</span>
                  {feedback.length ? (
                    feedback.map((item) => (
                      <div className="asw-admin-feedback-item" key={item.id}>
                        {item.comment && <p>{item.comment}</p>}
                        {item.audioUrl && (
                          <audio
                            controls
                            preload="none"
                            src={item.audioUrl}
                            aria-label="Teacher audio feedback"
                          />
                        )}
                        {item.createdAt && <small>{formatWorkDate(item.createdAt)}</small>}
                      </div>
                    ))
                  ) : (
                    <p className="asw-admin-no-media">No feedback yet</p>
                  )}
                </div>
              </article>
            );

          return (
            <article className="asw-card" key={row.id}>
              <div className="asw-card-heading">
                <div>
                  <h2>{row.studentName}</h2>
                  <p>
                    {row.className} · {row.title}
                  </p>
                </div>
                <span className={row.status === 'Awaiting submission' ? 'is-awaiting' : ''}>
                  {row.status}
                </span>
              </div>
              <p className="asw-date">
                <CalendarDays size={15} />{' '}
                {row.status === 'Awaiting submission' ? 'Assigned' : 'Submitted'}{' '}
                {row.date ? formatWorkDate(row.date) : 'date unavailable'}
                {row.dueDate
                  ? ` · Due ${new Date(`${row.dueDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
                  : ''}
              </p>
              {row.detail && <p className="asw-detail">{row.detail}</p>}
              {attachments.map(renderMedia)}
            </article>
          );
        })}
      </div>
      {shownRows.length < visibleRows.length && (
        <button
          type="button"
          className="asw-load-more"
          onClick={() => setLimit((count) => count + 12)}
        >
          Show older submissions ({visibleRows.length - shownRows.length} remaining)
        </button>
      )}
      {teacherMode && kind === 'practice' && (
        <PracticeReview
          cloud={cloud}
          workspace={institution}
          entries={practiceEntries.filter((entry) => !classId || String(entry.classId) === classId)}
          students={sourceStudents}
          onReload={reloadWork}
        />
      )}
    </section>
  );
}
