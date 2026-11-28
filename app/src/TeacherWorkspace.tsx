import './practiceInsights.css';
import './homeworkCardActions.css';
import AudioFeedbackRecorder from './AudioFeedbackRecorder';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  homeworkFileAllowed,
  homeworkSelectionAllowed,
  homeworkMediaKind,
  HomeworkMediaPreview,
} from './HomeworkMaterials';
import { ChevronDown, ChevronRight, UploadCloud } from 'lucide-react';
import './homeworkIcons.css';
import { homeworkMediaAccept, homeworkMimeForFile } from './homeworkMediaPolicy';
import { RefreshCw } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import {
  eligibleStudentIds,
  visibleMasterClasses,
  visibleDatedSessions,
} from './operationsSelectors';
import SessionAttendanceRegister from './SessionAttendanceRegister';
import { SwaraMitraAudience } from './app/SwaraMitraAudience';
import './teacherWorkspace.css';
import './learningExperience.css';
import './unifiedLayout.css';
import './classNotes.css';

type Area = 'attendance' | 'students' | 'history' | 'homework' | 'classNotes';
const initialTeachingArea = (value: string): Area =>
  value === 'attendance' || value === 'homework' || value === 'classNotes' ? value : 'students';
const tabs: { id: Area; label: string }[] = [
  { id: 'students', label: 'My Students' },
  { id: 'classNotes', label: 'Class Notes' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'homework', label: 'Assign Homework' },
  { id: 'history', label: 'History' },
];
const studentLabel = (s: any) =>
  `${s.name || 'Student'}${s.rollNumber ? ` · ${s.rollNumber}` : ''}`;
export default function TeacherWorkspace({
  cloud,
  workspace,
  initialArea = 'enrolment',
  initialClass = '',
  workOnly = false,
}: {
  cloud?: CloudSession;
  workspace: InstitutionId;
  initialArea?: string;
  initialClass?: string;
  workOnly?: boolean;
}) {
  const [area, setArea] = useState<Area>(() => initialTeachingArea(initialArea));
  useEffect(() => {
    setArea(initialTeachingArea(initialArea));
  }, [initialArea]);
  const [students, setStudents] = useState<any[]>([]),
    [enrolments, setEnrolments] = useState<any[]>([]),
    [attendance, setAttendance] = useState<any[]>([]),
    [rsvps, setRsvps] = useState<any[]>([]),
    [schedule, setSchedule] = useState<any[]>([]),
    [classNotes, setClassNotes] = useState<any[]>([]);
  const [classNoteDate, setClassNoteDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  );
  const [classNoteText, setClassNoteText] = useState('');
  const [editingClassNote, setEditingClassNote] = useState<any>(null);
  const [swaramitraPreferences, setSwaramitraPreferences] = useState<Record<string, any>>({});
  const [preferenceBusyId, setPreferenceBusyId] = useState('');
  const [homeworkTitle, setHomeworkTitle] = useState(''),
    [homeworkInstructions, setHomeworkInstructions] = useState(''),
    [homeworkDue, setHomeworkDue] = useState('');
  const [homeworkWhatsAppDraft, setHomeworkWhatsAppDraft] = useState({
    enabled: false,
    message: '',
  });
  const [homeworkFiles, setHomeworkFiles] = useState<File[]>([]);
  const [existingMaterials, setExistingMaterials] = useState<
    Array<{ id: string; mime: string; size: number; url: string }>
  >([]);
  const [removedMaterialIds, setRemovedMaterialIds] = useState<string[]>([]);
  const [editingHomework, setEditingHomework] = useState<{ id: string; version: number } | null>(
    null,
  );
  const [assignments, setAssignments] = useState<
    Array<{
      id: string;
      title: string;
      instructions: string;
      dueDate: string;
      createdAt?: string;
      version?: number;
    }>
  >([]);
  const loadAssignments = async (id: string) => {
    if (!cloud || !id) return;
    try {
      const result = await cloud.api.listClassHomework(workspace, id);
      setAssignments(result.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load assignments');
    }
  };
  const chooseHomeworkFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...homeworkFiles, ...Array.from(files)];
    const mimes = [
      ...existingMaterials.filter((m) => !removedMaterialIds.includes(m.id)).map((m) => m.mime),
      ...next.map(homeworkMimeForFile),
    ];
    if (next.some((f) => !homeworkFileAllowed(f)) || !homeworkSelectionAllowed(mimes)) {
      setError('Choose up to 4 attachments. Check that each file type and size is supported.');
      return;
    }
    setError('');
    setHomeworkFiles(next);
  };
  const retainedHomeworkMimes = [
    ...existingMaterials.filter((m) => !removedMaterialIds.includes(m.id)).map((m) => m.mime),
    ...homeworkFiles.map(homeworkMimeForFile),
  ];
  const homeworkAttachmentCount = retainedHomeworkMimes.length;
  const startEdit = async (a: {
    id: string;
    title: string;
    instructions: string;
    dueDate: string;
    version?: number;
  }) => {
    if (!cloud || !effectiveClass) return;
    setBusy(true);
    setError('');
    try {
      const links = await cloud.api.teacherHomeworkMaterialLinks(workspace, effectiveClass, a.id);
      setExistingMaterials(links.records);
      setRemovedMaterialIds([]);
      setHomeworkFiles([]);
      setHomeworkWhatsAppDraft({ enabled: false, message: '' });
      setEditingHomework({ id: a.id, version: a.version || 1 });
      setHomeworkTitle(a.title);
      setHomeworkInstructions(a.instructions);
      setHomeworkDue(a.dueDate);
      setNotice('Editing published homework');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load existing attachments');
    } finally {
      setBusy(false);
    }
  };
  const deleteAssignment = async (a: { id: string; title: string }) => {
    if (!cloud || !effectiveClass || busy) return;
    if (
      !window.confirm(
        `Remove homework "${a.title}" from this class? Existing submissions and audit history will be preserved.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await cloud.api.deleteClassHomework(workspace, effectiveClass, a.id);
      if (editingHomework?.id === a.id) resetHomeworkForm();
      if (reviewId === a.id) {
        setReviewId('');
        setSubmissions([]);
      }
      await loadAssignments(effectiveClass);
      setNotice('Homework removed. Submission history retained.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove homework');
    } finally {
      setBusy(false);
    }
  };
  const resetHomeworkForm = () => {
    setEditingHomework(null);
    setHomeworkTitle('');
    setHomeworkInstructions('');
    setHomeworkDue('');
    setHomeworkWhatsAppDraft({ enabled: false, message: '' });
    setHomeworkFiles([]);
    setExistingMaterials([]);
    setRemovedMaterialIds([]);
  };
  const publishAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloud || !effectiveClass) return;
    setBusy(true);
    setError('');
    const wasEditing = !!editingHomework;
    try {
      const result = editingHomework
        ? await cloud.api.republishClassHomework(
            workspace,
            effectiveClass,
            editingHomework.id,
            homeworkTitle,
            homeworkInstructions,
            homeworkDue,
            editingHomework.version,
          )
        : await cloud.api.publishClassHomework(
            workspace,
            effectiveClass,
            homeworkTitle,
            homeworkInstructions,
            homeworkDue,
          );
      const id = result.record.id;
      const version = result.record.version || (editingHomework?.version || 0) + 1;
      // Retain the saved assignment identity if an attachment transfer subsequently fails.
      setEditingHomework({ id, version });
      const kept = existingMaterials.filter((m) => !removedMaterialIds.includes(m.id));
      const ids = kept.map((m) => m.id);
      if (homeworkFiles.length || removedMaterialIds.length) {
        // First publish the assignment, then upload its private materials using its new ID.
        // Never overwrite existing linked materials if an upload fails.
        for (const file of homeworkFiles) {
          const mime = homeworkMimeForFile(file);
          const signed = await cloud.api.beginTeacherHomeworkMaterial(
            workspace,
            effectiveClass,
            id,
            mime,
            file.size,
          );
          const response = await fetch(signed.uploadUrl, {
            method: 'PUT',
            headers: { ...signed.headers, 'Content-Type': mime },
            body: file,
          });
          if (!response.ok) throw Error(`Material upload failed (${response.status})`);
          const saved = await cloud.api.finishTeacherHomeworkMaterial(
            workspace,
            effectiveClass,
            id,
            signed.key,
          );
          ids.push(saved.record.id);
        }
        await cloud.api.setTeacherHomeworkMaterials(workspace, effectiveClass, id, ids, version);
      }
      let whatsappError = '';
      let whatsappSent = 0;
      if (!wasEditing && homeworkWhatsAppDraft.enabled) {
        try {
          const message = homeworkWhatsAppDraft.message.trim();
          if (!message) throw new Error('Enter a message, or untick the WhatsApp option.');
          const queued = await cloud.api.sendSwaraMitraScheduleUpdate(workspace, effectiveClass, {
            resourceId: id,
            title: 'New homework',
            message,
            requestId: crypto.randomUUID(),
          });
          if (queued.eligible === 0)
            throw new Error('No currently consented students are eligible for WhatsApp.');
          if (queued.queued !== queued.eligible)
            throw new Error('Only some of the eligible WhatsApp messages were queued.');
          whatsappSent = queued.queued;
        } catch (notificationError) {
          whatsappError =
            notificationError instanceof Error
              ? notificationError.message
              : 'WhatsApp could not be queued.';
        }
      }
      resetHomeworkForm();
      await loadAssignments(effectiveClass);
      if (whatsappError) {
        setError(
          `Homework was published and students have in-app notices, but WhatsApp was not fully queued. ${whatsappError}`,
        );
        setNotice('Homework published to enrolled students in Sadhana');
      } else {
        setNotice(
          wasEditing
            ? 'Homework republished'
            : homeworkWhatsAppDraft.enabled
              ? `Homework published. WhatsApp queued for ${whatsappSent} opted-in students.`
              : 'Homework published to enrolled students in Sadhana',
        );
      }
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'Unable to publish homework'}. If the assignment was published, refresh the list before retrying.`,
      );
      await loadAssignments(effectiveClass);
    } finally {
      setBusy(false);
    }
  };
  const [classId, setClassId] = useState(initialClass),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (initialClass) setClassId(initialClass);
  }, [initialClass]);
  const [reviewId, setReviewId] = useState('');
  const [reviewWhatsAppEnabled, setReviewWhatsAppEnabled] = useState<Record<string, boolean>>({});
  const [reviewWhatsAppMessages, setReviewWhatsAppMessages] = useState<Record<string, string>>({});
  const [historyPeriod, setHistoryPeriod] = useState('all'),
    [historyFrom, setHistoryFrom] = useState(''),
    [historyTo, setHistoryTo] = useState(''),
    [historyStudent, setHistoryStudent] = useState('');
  const [submissions, setSubmissions] = useState<
    Array<{
      studentId: string;
      text: string;
      version: number;
      attachmentIds: string[];
      submittedAt?: string | null;
      updatedAt?: string;
      feedback?: string;
      feedbackAudioUrl?: string;
      reviewedAt?: string | null;
    }>
  >([]);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const [feedbackAudio, setFeedbackAudio] = useState<
    Record<string, { id?: string; url?: string; name?: string; uploading?: boolean }>
  >({});
  const [teacherLinks, setTeacherLinks] = useState<
    Record<string, Array<{ id: string; mime: string; url: string }>>
  >({});
  const [collapsedSubmissions, setCollapsedSubmissions] = useState<Record<string, boolean>>({});
  const reviewHomework = async (id: string) => {
    if (!cloud || !effectiveClass) return;
    setReviewId(id);
    try {
      const result = await cloud.api.teacherHomeworkSubmissions(workspace, effectiveClass, id);
      setSubmissions(result.records);
      setFeedbackText(
        Object.fromEntries(result.records.map((x) => [x.studentId, x.feedback || ''])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load submissions');
    }
  };
  const saveFeedback = async (row: { studentId: string; version: number }) => {
    if (!cloud || !effectiveClass) return;
    const reviewKey = `${reviewId}:${row.studentId}`;
    const shouldSendWhatsApp = reviewWhatsAppEnabled[reviewKey] === true;
    const homeworkName = assignments.find((item) => item.id === reviewId)?.title || 'your homework';
    const defaultMessage = `Your teacher has reviewed ${homeworkName}. Open Sadhana to see your feedback.`;
    const message = reviewWhatsAppMessages[reviewKey]?.trim() ?? defaultMessage;
    if (shouldSendWhatsApp && !message) {
      setError('Enter a WhatsApp message, or untick the WhatsApp option.');
      return;
    }
    try {
      await cloud.api.teacherHomeworkFeedback(
        workspace,
        effectiveClass,
        reviewId,
        row.studentId,
        feedbackText[row.studentId] || '',
        row.version,
        feedbackAudio[row.studentId]?.id,
      );
      if (shouldSendWhatsApp) {
        try {
          const result = await cloud.api.sendSwaraMitraScheduleUpdate(workspace, effectiveClass, {
            resourceId: reviewId,
            title: 'Homework reviewed',
            message,
            requestId: crypto.randomUUID(),
            recipientStudentId: row.studentId,
          });
          if (result.eligible !== 1 || result.queued !== 1)
            throw new Error('This student is not currently eligible for WhatsApp.');
        } catch (notificationError) {
          setError(
            `Feedback was saved and the student received an in-app notice, but WhatsApp was not queued. ${notificationError instanceof Error ? notificationError.message : ''}`,
          );
          await reviewHomework(reviewId);
          return;
        }
      }
      await reviewHomework(reviewId);
      setNotice(
        shouldSendWhatsApp
          ? 'Feedback saved. The student received an in-app notice and WhatsApp was queued.'
          : 'Feedback saved. The student received an in-app notice.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save feedback');
    }
  };
  const request = useRef(0);
  const reload = async () => {
    if (!cloud) return;
    const id = ++request.current;
    setBusy(true);
    setError('');
    try {
      const [st, en, at, sc, rv] = await Promise.all([
        cloud.api.listOperations('student', workspace),
        cloud.api.listOperations('enrolment', workspace),
        cloud.api.listOperations('attendance', workspace),
        cloud.api.listSchedule(workspace),
        cloud.api.listOperations('rsvp', workspace),
      ]);
      if (id !== request.current) return;
      setStudents(st.records || []);
      setEnrolments(en.records || []);
      setAttendance(at.records || []);
      setRsvps(rv.records || []);
      setSchedule(sc.records || []);
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : 'Unable to load teaching workspace.');
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  useEffect(() => {
    void reload();
    return () => {
      request.current++;
    };
  }, [cloud?.api, workspace]);
  const classes = useMemo(
    () => visibleMasterClasses(schedule, enrolments, true),
    [schedule, enrolments],
  );
  const sessions = useMemo(
    () => visibleDatedSessions(schedule, enrolments, true),
    [schedule, enrolments],
  );
  const selectedClass = classes.find((c) => c.id === classId);
  const effectiveClass = selectedClass?.id || classes[0]?.id || '';
  useEffect(() => {
    if (!cloud || (area !== 'students' && area !== 'homework') || !effectiveClass) return;
    let current = true;
    void cloud.api
      .listSwaraMitraPreferences(workspace, effectiveClass)
      .then((result) => {
        if (current)
          setSwaramitraPreferences(
            Object.fromEntries(result.records.map((record) => [record.studentId, record])),
          );
      })
      .catch((loadError) => {
        if (current)
          setError(
            loadError instanceof Error ? loadError.message : 'Unable to load SwaraMitra settings.',
          );
      });
    return () => {
      current = false;
    };
  }, [area, effectiveClass, cloud?.api, workspace]);
  const saveSwaraMitraPreference = async (studentId: string, whatsappAllowed: boolean) => {
    if (!cloud || !effectiveClass || preferenceBusyId) return;
    setPreferenceBusyId(studentId);
    setError('');
    try {
      const result = await cloud.api.updateSwaraMitraPreference(
        workspace,
        effectiveClass,
        studentId,
        { whatsappAllowed },
      );
      setSwaramitraPreferences((current) => ({ ...current, [studentId]: result.record }));
      setNotice('SwaraMitra settings saved. In-app notifications remain on.');
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Unable to save SwaraMitra settings.',
      );
    } finally {
      setPreferenceBusyId('');
    }
  };
  useEffect(() => {
    if (area === 'homework' && effectiveClass) void loadAssignments(effectiveClass);
  }, [area, effectiveClass, cloud?.api, workspace]);
  useEffect(() => {
    setEditingClassNote(null);
    setClassNoteText('');
    setClassNoteDate(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
  }, [effectiveClass]);
  useEffect(() => {
    let active = true;
    if (!cloud || area !== 'classNotes' || !effectiveClass) return;
    setClassNotes([]);
    void cloud.api
      .listOperations('class-note', workspace)
      .then((result) => {
        if (active)
          setClassNotes(
            result.records
              .filter((record) => record.classId === effectiveClass)
              .sort(
                (a, b) =>
                  String(b.date).localeCompare(String(a.date)) ||
                  String(b.updatedAt || b.createdAt).localeCompare(
                    String(a.updatedAt || a.createdAt),
                  ),
              ),
          );
      })
      .catch((loadError) => {
        if (active)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load class notes.');
      });
    return () => {
      active = false;
    };
  }, [area, effectiveClass, cloud?.api, workspace]);
  const saveClassNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cloud || !effectiveClass || !classNoteText.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const existing =
        editingClassNote ||
        classNotes.find((note) => note.date === classNoteDate && note.classId === effectiveClass);
      if (existing) {
        await cloud.api.updateOperation(
          'class-note',
          workspace,
          existing.id,
          { classId: effectiveClass, date: classNoteDate, note: classNoteText.trim() },
          existing.version || 0,
        );
      } else {
        await cloud.api.createOperation('class-note', workspace, {
          classId: effectiveClass,
          date: classNoteDate,
          note: classNoteText.trim(),
        });
      }
      const result = await cloud.api.listOperations('class-note', workspace);
      const next = result.records
        .filter((record) => record.classId === effectiveClass)
        .sort(
          (a, b) =>
            String(b.date).localeCompare(String(a.date)) ||
            String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
        );
      setClassNotes(next);
      setEditingClassNote(null);
      setClassNoteDate(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
      );
      setClassNoteText('');
      setNotice(existing ? 'Class note updated.' : 'Class note saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save class note.');
    } finally {
      setBusy(false);
    }
  };
  const ids = useMemo(
    () => eligibleStudentIds(enrolments, effectiveClass),
    [enrolments, effectiveClass],
  );
  const roster = useMemo(
    () =>
      students
        .filter((s) => ids.has(s.id))
        .sort(
          (a, b) =>
            String(b.createdAt || '').localeCompare(String(a.createdAt || '')) ||
            String(a.rollNumber || a.name).localeCompare(String(b.rollNumber || b.name)),
        ),
    [students, ids],
  );
  const visibleRoster = roster.filter((s) =>
    studentLabel(s).toLowerCase().includes(search.toLowerCase()),
  );
  const history = attendance
    .filter((a) =>
      sessions.some(
        (s) => s.id === a.sessionId && (!effectiveClass || s.classId === effectiveClass),
      ),
    )
    .sort((a, b) =>
      String(sessions.find((s) => s.id === b.sessionId)?.date || '').localeCompare(
        String(sessions.find((s) => s.id === a.sessionId)?.date || ''),
      ),
    );
  const historyToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const historyStart =
    historyPeriod === 'week'
      ? (() => {
          const d = new Date(`${historyToday}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
          return d.toISOString().slice(0, 10);
        })()
      : historyPeriod === 'month'
        ? historyToday.slice(0, 7) + '-01'
        : historyPeriod === 'custom'
          ? historyFrom
          : '';
  const historyEnd =
    historyPeriod === 'custom' ? historyTo : historyPeriod === 'all' ? '' : historyToday;
  const filteredHistory = history.filter((a) => {
    const date = String(sessions.find((s) => s.id === a.sessionId)?.date || '');
    return (
      (!historyStart || date >= historyStart) &&
      (!historyEnd || date <= historyEnd) &&
      (!historyStudent || a.studentId === historyStudent)
    );
  });
  const studentById = new Map(students.map((s) => [s.id, s]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  return (
    <div className={`teacher-workspace${workOnly ? ' teacher-workspace--work-only' : ''}`}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEACHER WORKSPACE</div>
          <h1>My Teaching</h1>
          <p>
            {workspace === 'sruti' ? 'Śruti Vedam' : 'Raagasudha'} · Assigned classes and students
          </p>
        </div>
        <button
          type="button"
          className="reg-secondary"
          onClick={() => void reload()}
          disabled={busy}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <div className="tw-stats">
        <div>
          <span>Assigned classes</span>
          <strong>{classes.length}</strong>
        </div>
        <div>
          <span>Enrolled students</span>
          <strong>
            {new Set(enrolments.filter((e) => !e.archived).map((e) => e.studentId)).size}
          </strong>
        </div>
        <div>
          <span>Attendance marks</span>
          <strong>{attendance.length}</strong>
        </div>
      </div>
      <section className="surface tw-panel">
        <nav className="tw-tabs" aria-label="My Teaching sections">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              className={area === t.id ? 'active' : ''}
              aria-current={area === t.id ? 'page' : undefined}
              onClick={() => {
                setArea(t.id);
                if (t.id === 'homework') void loadAssignments(effectiveClass);
                setSearch('');
                setError('');
                setNotice('');
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {error && (
          <p role="alert" className="sadhana-sync-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="tw-notice">
            {notice}
          </p>
        )}
        {area === 'attendance' && cloud && (
          <div key={area} className="tw-tab-stage">
            <SessionAttendanceRegister
              cloud={cloud}
              workspace={workspace}
              schedule={schedule}
              students={students}
              enrolments={enrolments}
              attendance={attendance}
              rsvps={rsvps}
              onSaved={reload}
            />
            <aside className="tw-class-note-reminder">
              <div>
                <strong>Next step after every class: add Class Notes</strong>
                <span>Share the key takeaway while the session is fresh for students.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setArea('classNotes');
                  setError('');
                  setNotice('');
                }}
              >
                Add class notes
              </button>
            </aside>
          </div>
        )}
        {area !== 'attendance' && (
          <div key={area} className="tw-content tw-tab-stage">
            <div className="tw-filter">
              <label>
                Class
                <select
                  aria-label="Select teaching class"
                  value={effectiveClass}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setEditingHomework(null);
                    if (area === 'homework') void loadAssignments(e.target.value);
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {area === 'students' && (
                <label>
                  Find a student
                  <input
                    aria-label="Search students"
                    placeholder="Name or roll number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              )}
            </div>
            {!classes.length && (
              <p role="status">
                {cloud?.staff.role === 'viewer'
                  ? 'No class assigned.'
                  : 'No verified assigned classes are available. Ask an administrator to check your teacher identity and class assignments.'}
              </p>
            )}
            {area === 'students' &&
              !enrolments.length &&
              !busy &&
              !error &&
              !(cloud?.staff.role === 'viewer' && !classes.length) && (
                <p role="status" className="sadhana-sync-error">
                  No enrollment records were returned for this academy. The teacher roster cannot be
                  built until students have valid class enrollments. Existing teacher assignments
                  were not changed.
                </p>
              )}
            {area === 'students' && (
              <>
                <div className="tw-section-head">
                  <h2>Class students</h2>
                  <span>{roster.length} enrolled</span>
                </div>
                <p className="tw-hint">Sadhana in-app notices stay on either way.</p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Roll number</th>
                        <th>Student</th>
                        <th>Enrolment</th>
                        <th className="tw-swaramitra-heading">Notifications</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRoster.map((s) => {
                        const settings = swaramitraPreferences[s.id] || { whatsappAllowed: false };
                        const saving = preferenceBusyId === s.id;
                        return (
                          <tr key={s.id}>
                            <td>{s.rollNumber || '—'}</td>
                            <td>
                              <strong>{s.name}</strong>
                            </td>
                            <td>Active</td>
                            <td className="tw-swaramitra-cell">
                              <div className="tw-swaramitra-controls">
                                <label
                                  className={!settings.whatsappAllowed ? 'is-unallowed' : undefined}
                                >
                                  <input
                                    type="checkbox"
                                    aria-label={`SwaraMitra notifications for ${s.name}`}
                                    checked={settings.whatsappAllowed}
                                    disabled={saving || Boolean(preferenceBusyId)}
                                    onChange={(event) =>
                                      void saveSwaraMitraPreference(s.id, event.target.checked)
                                    }
                                  />
                                </label>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!visibleRoster.length && (
                        <tr>
                          <td colSpan={4}>No students found for this class.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {area === 'homework' && cloud && (
              <section className="sv1276-teacher-homework">
                <div className="tw-homework-composer">
                  <header className="tw-homework-head">
                    <h3>Class homework</h3>
                    <p>
                      Create or update an assignment. Enrolled students will see it in their portal.
                    </p>
                  </header>
                  <form className="sv1276-hw-form" onSubmit={(e) => void publishAssignment(e)}>
                    <label>
                      Assignment title
                      <input
                        value={homeworkTitle}
                        disabled={busy}
                        maxLength={120}
                        required
                        onChange={(e) => setHomeworkTitle(e.target.value)}
                        placeholder="e.g. Practice lesson 4"
                      />
                    </label>
                    <label>
                      Due date
                      <input
                        type="date"
                        disabled={busy}
                        required
                        value={homeworkDue}
                        onChange={(e) => setHomeworkDue(e.target.value)}
                      />
                    </label>
                    <label className="sv1276-hw-wide">
                      Instructions
                      <textarea
                        value={homeworkInstructions}
                        disabled={busy}
                        maxLength={3000}
                        required
                        onChange={(e) => setHomeworkInstructions(e.target.value)}
                      />
                    </label>
                    <div className="sv1276-hw-wide sadhana-form-materials">
                      <strong>Attachments · {homeworkAttachmentCount}/4</strong>
                      <p>Add up to four images, audio files, or videos for the assignment.</p>
                      <label className="sadhana-attachment-add">
                        <UploadCloud size={19} />
                        <span>Add attachments</span>
                        <input
                          aria-label="Add assignment attachments"
                          type="file"
                          multiple
                          accept={homeworkMediaAccept}
                          disabled={busy || homeworkAttachmentCount >= 4}
                          onChange={(e) => {
                            chooseHomeworkFiles(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {existingMaterials
                        .filter((m) => !removedMaterialIds.includes(m.id))
                        .map((m) => (
                          <div key={m.id} className="sadhana-material-file">
                            <HomeworkMediaPreview
                              mime={m.mime}
                              url={m.url}
                              alt={`Existing homework ${homeworkMediaKind(m.mime).toLowerCase()}`}
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setRemovedMaterialIds((x) => [...x, m.id])}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      {homeworkFiles.map((file, i) => (
                        <div key={`${file.name}-${i}`} className="sadhana-material-file">
                          <span>{file.name}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setHomeworkFiles((x) => x.filter((_, j) => j !== i))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    {!editingHomework && (
                      <div className="sv1276-hw-wide">
                        <SwaraMitraAudience
                          cloud={cloud}
                          institution={workspace}
                          classId={effectiveClass}
                          draft={homeworkWhatsAppDraft}
                          suggestedMessage={`New homework: ${homeworkTitle || 'your assignment'}${homeworkDue ? `, due ${homeworkDue}` : ''}. Open Sadhana to view the instructions.`}
                          onDraftChange={setHomeworkWhatsAppDraft}
                        />
                      </div>
                    )}
                    <div className="sv1276-hw-wide sv1276-hw-actions">
                      <button
                        className="sadhana-hw-primary"
                        type="submit"
                        disabled={busy || !effectiveClass}
                      >
                        {editingHomework ? 'Save & republish' : 'Publish homework'}
                      </button>
                      {editingHomework && (
                        <button
                          className="sadhana-hw-secondary"
                          type="button"
                          onClick={resetHomeworkForm}
                        >
                          Cancel edit
                        </button>
                      )}
                    </div>
                  </form>
                </div>
                <h3>Published assignments</h3>
                {assignments.length ? (
                  <div className="sv1276-hw-records">
                    {[...assignments]
                      .sort((a, b) =>
                        String(b.createdAt || b.dueDate).localeCompare(
                          String(a.createdAt || a.dueDate),
                        ),
                      )
                      .map((a) => (
                        <article key={a.id}>
                          <strong>{a.title}</strong>
                          <span>Due {a.dueDate}</span>
                          <p>{a.instructions}</p>
                          <div className="homework-card-actions">
                            <button
                              className="sadhana-hw-secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void startEdit(a)}
                            >
                              Edit & republish
                            </button>
                            <button
                              className="sadhana-hw-secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => void reviewHomework(a.id)}
                            >
                              Review Submissions
                            </button>
                            <button
                              className="sadhana-hw-secondary sadhana-hw-danger"
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteAssignment(a)}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <p>No assignments published for this class.</p>
                )}
                {reviewId && (
                  <div className="sv1278-review">
                    <h3>Submitted work</h3>
                    {submissions.length ? (
                      [...submissions]
                        .sort((a, b) =>
                          String(b.submittedAt || b.updatedAt || '').localeCompare(
                            String(a.submittedAt || a.updatedAt || ''),
                          ),
                        )
                        .map((row, index) => {
                          const studentName = studentById.get(row.studentId)?.name || 'Learner';
                          const submissionKey = `${reviewId}:${row.studentId}`;
                          const detailsId = `homework-submission-details-${index}`;
                          const isCollapsed = collapsedSubmissions[submissionKey] !== false;
                          return (
                            <article key={row.studentId}>
                              <header className="tw-submission-header">
                                <strong>
                                  {studentName} · {studentById.get(row.studentId)?.rollNumber || ''}
                                </strong>
                                <span
                                  className={`tw-submission-status ${row.reviewedAt ? 'is-reviewed' : 'is-pending'}`}
                                  role="status"
                                >
                                  {row.reviewedAt ? 'Reviewed' : 'Pending review'}
                                </span>
                                <button
                                  type="button"
                                  className="tw-submission-toggle"
                                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${studentName}'s submission`}
                                  aria-expanded={!isCollapsed}
                                  aria-controls={detailsId}
                                  onClick={() =>
                                    setCollapsedSubmissions((current) => ({
                                      ...current,
                                      [submissionKey]: !isCollapsed,
                                    }))
                                  }
                                >
                                  {isCollapsed ? (
                                    <ChevronRight aria-hidden="true" />
                                  ) : (
                                    <ChevronDown aria-hidden="true" />
                                  )}
                                </button>
                              </header>
                              <div
                                id={detailsId}
                                className="tw-submission-details"
                                hidden={isCollapsed}
                              >
                                <p>{row.text || 'No written response'}</p>
                                {row.attachmentIds.length > 0 && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!cloud) return;
                                        try {
                                          const data = await cloud.api.teacherHomeworkEvidenceLinks(
                                            workspace,
                                            effectiveClass,
                                            reviewId,
                                            row.studentId,
                                          );
                                          setTeacherLinks((p) => ({
                                            ...p,
                                            [row.studentId]: data.records,
                                          }));
                                        } catch (e) {
                                          setError(
                                            e instanceof Error
                                              ? e.message
                                              : 'Cannot load attachments',
                                          );
                                        }
                                      }}
                                    >
                                      View attachments · {row.attachmentIds.length}
                                    </button>
                                    <ul>
                                      {(teacherLinks[row.studentId] || []).map((file) => (
                                        <li key={file.id}>
                                          <HomeworkMediaPreview
                                            mime={file.mime}
                                            url={file.url}
                                            alt="Student submitted image"
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                <section
                                  className="tw-homework-feedback"
                                  aria-label="Teacher feedback"
                                >
                                  {row.reviewedAt && (
                                    <p className="tw-homework-reviewed" role="status">
                                      Reviewed · {row.reviewedAt.slice(0, 10)}
                                    </p>
                                  )}
                                  <h4>Teacher feedback</h4>
                                  <label>
                                    <span>
                                      Written feedback <small>Optional</small>
                                    </span>
                                    <textarea
                                      rows={4}
                                      maxLength={2000}
                                      disabled={Boolean(row.reviewedAt)}
                                      value={feedbackText[row.studentId] || ''}
                                      onChange={(e) =>
                                        setFeedbackText((p) => ({
                                          ...p,
                                          [row.studentId]: e.target.value,
                                        }))
                                      }
                                      placeholder="Share feedback about this submission…"
                                    />
                                  </label>
                                  {row.feedbackAudioUrl && !feedbackAudio[row.studentId]?.url && (
                                    <audio
                                      controls
                                      preload="none"
                                      src={row.feedbackAudioUrl}
                                      aria-label="Saved teacher audio feedback"
                                    />
                                  )}
                                  <div className="tw-feedback-audio-picker">
                                    <span>
                                      Audio feedback <small>Optional</small>
                                    </span>
                                    <AudioFeedbackRecorder
                                      label={`Record optional audio feedback for ${row.studentId}`}
                                      disabled={
                                        Boolean(row.reviewedAt) ||
                                        feedbackAudio[row.studentId]?.uploading
                                      }
                                      onRecording={(file) => {
                                        if (!cloud || !effectiveClass) return;
                                        const mime = file.type;
                                        setFeedbackAudio((current) => ({
                                          ...current,
                                          [row.studentId]: { name: file.name, uploading: true },
                                        }));
                                        void (async () => {
                                          try {
                                            const signed =
                                              await cloud.api.beginTeacherHomeworkFeedbackAudio(
                                                workspace,
                                                effectiveClass,
                                                reviewId,
                                                row.studentId,
                                                mime,
                                                file.size,
                                              );
                                            const uploaded = await fetch(signed.uploadUrl, {
                                              method: 'PUT',
                                              headers: { ...signed.headers, 'Content-Type': mime },
                                              body: file,
                                            });
                                            if (!uploaded.ok)
                                              throw new Error(
                                                `Audio upload failed (${uploaded.status})`,
                                              );
                                            const saved =
                                              await cloud.api.finishTeacherHomeworkFeedbackAudio(
                                                workspace,
                                                effectiveClass,
                                                reviewId,
                                                row.studentId,
                                                signed.key,
                                              );
                                            setFeedbackAudio((current) => ({
                                              ...current,
                                              [row.studentId]: {
                                                id: saved.audioId,
                                                name: file.name,
                                                url: URL.createObjectURL(file),
                                              },
                                            }));
                                          } catch (uploadError) {
                                            setFeedbackAudio((current) => ({
                                              ...current,
                                              [row.studentId]: {},
                                            }));
                                            setError(
                                              uploadError instanceof Error
                                                ? uploadError.message
                                                : 'Unable to upload audio feedback',
                                            );
                                          }
                                        })();
                                      }}
                                    />
                                  </div>
                                  {feedbackAudio[row.studentId]?.url && (
                                    <div className="tw-feedback-audio-preview">
                                      <span>{feedbackAudio[row.studentId]?.name}</span>
                                      <audio
                                        controls
                                        preload="metadata"
                                        src={feedbackAudio[row.studentId]?.url}
                                      />
                                    </div>
                                  )}
                                  {(() => {
                                    const reviewKey = `${reviewId}:${row.studentId}`;
                                    const permission = swaramitraPreferences[row.studentId];
                                    const canWhatsApp =
                                      permission?.whatsappAllowed === true &&
                                      permission?.whatsappReady === true;
                                    const suggestedMessage = `Your teacher has reviewed ${assignments.find((item) => item.id === reviewId)?.title || 'your homework'}. Open Sadhana to see your feedback.`;
                                    return (
                                      <div
                                        className={`tw-review-notification${canWhatsApp ? '' : ' is-unavailable'}`}
                                      >
                                        <label>
                                          <input
                                            type="checkbox"
                                            checked={reviewWhatsAppEnabled[reviewKey] === true}
                                            disabled={Boolean(row.reviewedAt) || !canWhatsApp}
                                            onChange={(event) =>
                                              setReviewWhatsAppEnabled((current) => ({
                                                ...current,
                                                [reviewKey]: event.target.checked,
                                              }))
                                            }
                                          />
                                          <span>Also send a WhatsApp update to this student</span>
                                        </label>
                                        <small>
                                          {canWhatsApp
                                            ? 'The in-app notice is always sent.'
                                            : permission?.whatsappAllowed === true
                                              ? 'WhatsApp unavailable · in-app notice only.'
                                              : 'WhatsApp not allowed · in-app notice only.'}
                                        </small>
                                        {reviewWhatsAppEnabled[reviewKey] === true && (
                                          <label className="tw-review-notification__message">
                                            WhatsApp message
                                            <textarea
                                              rows={2}
                                              maxLength={1000}
                                              value={
                                                reviewWhatsAppMessages[reviewKey] ??
                                                suggestedMessage
                                              }
                                              onChange={(event) =>
                                                setReviewWhatsAppMessages((current) => ({
                                                  ...current,
                                                  [reviewKey]: event.target.value,
                                                }))
                                              }
                                            />
                                          </label>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <button
                                    type="button"
                                    className={row.reviewedAt ? 'is-reviewed' : undefined}
                                    disabled={
                                      Boolean(row.reviewedAt) ||
                                      !!feedbackAudio[row.studentId]?.uploading ||
                                      (!feedbackText[row.studentId]?.trim() &&
                                        !feedbackAudio[row.studentId]?.id &&
                                        !row.feedbackAudioUrl)
                                    }
                                    onClick={() => void saveFeedback(row)}
                                  >
                                    {row.reviewedAt
                                      ? 'Reviewed'
                                      : feedbackAudio[row.studentId]?.uploading
                                        ? 'Uploading audio…'
                                        : 'Save feedback'}
                                  </button>
                                </section>
                              </div>
                            </article>
                          );
                        })
                    ) : (
                      <p>No submitted homework yet.</p>
                    )}
                  </div>
                )}
              </section>
            )}
            {area === 'classNotes' && cloud && (
              <section className="tw-class-notes" aria-label="Class notes">
                <div className="tw-section-head">
                  <h2>
                    Class Notes ·{' '}
                    {classes.find((item) => item.id === effectiveClass)?.name || 'Selected class'}
                  </h2>
                  <span>Takeaways for enrolled students</span>
                </div>
                <form
                  className="tw-class-note-form"
                  onSubmit={(event) => void saveClassNote(event)}
                >
                  <label>
                    Date
                    <input
                      type="date"
                      value={classNoteDate}
                      required
                      disabled={busy}
                      onChange={(event) => setClassNoteDate(event.target.value)}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      value={classNoteText}
                      required
                      maxLength={2000}
                      rows={3}
                      disabled={busy}
                      placeholder="Share a short takeaway from this session…"
                      onChange={(event) => setClassNoteText(event.target.value)}
                    />
                  </label>
                  <div className="tw-class-note-actions">
                    <button
                      type="submit"
                      disabled={busy || !effectiveClass || !classNoteText.trim()}
                    >
                      {busy ? 'Saving…' : editingClassNote ? 'Update note' : 'Save class note'}
                    </button>
                    {editingClassNote && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setEditingClassNote(null);
                          setClassNoteText('');
                        }}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </form>
                {notice && (
                  <p className="tw-class-note-notice" role="status">
                    {notice}
                  </p>
                )}
                {classNotes.length ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classNotes.map((note) => (
                          <tr key={note.id}>
                            <td>
                              {new Date(`${note.date}T12:00:00Z`).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                timeZone: 'UTC',
                              })}
                            </td>
                            <td>
                              <div className="tw-class-note-cell">
                                <span>{note.note}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingClassNote(note);
                                    setClassNoteDate(note.date);
                                    setClassNoteText(note.note);
                                    setNotice('');
                                  }}
                                >
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="tw-hint">No class notes for this class yet.</p>
                )}
              </section>
            )}
            {area === 'history' && (
              <>
                <div className="tw-section-head">
                  <h2>Attendance history</h2>
                  <span>
                    {filteredHistory.length} of {history.length} saved marks
                  </span>
                </div>
                <div className="v1376-filters">
                  <label>
                    Period
                    <select
                      value={historyPeriod}
                      onChange={(e) => setHistoryPeriod(e.target.value)}
                    >
                      <option value="all">All dates</option>
                      <option value="week">This week</option>
                      <option value="month">This month</option>
                      <option value="custom">Custom range</option>
                    </select>
                  </label>
                  <label>
                    Student
                    <select
                      value={historyStudent}
                      onChange={(e) => setHistoryStudent(e.target.value)}
                    >
                      <option value="">All students</option>
                      {roster.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name} · {s.rollNumber || '—'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {historyPeriod === 'custom' && (
                    <>
                      <label>
                        From
                        <input
                          type="date"
                          value={historyFrom}
                          onChange={(e) => setHistoryFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        To
                        <input
                          type="date"
                          min={historyFrom || undefined}
                          value={historyTo}
                          onChange={(e) => setHistoryTo(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Session date</th>
                        <th>Student</th>
                        <th>Roll number</th>
                        <th>Mark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((a) => (
                        <tr key={a.id}>
                          <td>{sessionById.get(a.sessionId)?.date || '—'}</td>
                          <td>{studentById.get(a.studentId)?.name || 'Student'}</td>
                          <td>{studentById.get(a.studentId)?.rollNumber || '—'}</td>
                          <td>{a.status}</td>
                        </tr>
                      ))}
                      {!filteredHistory.length && (
                        <tr>
                          <td colSpan={4}>No attendance marks match this filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="tw-hint">
                  Dates refer to the scheduled session. Corrections must use the authorised
                  attendance workflow.
                </p>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
