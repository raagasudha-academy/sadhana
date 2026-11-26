import './practiceInsights.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpenCheck, X } from 'lucide-react';
import AudioFeedbackRecorder from './AudioFeedbackRecorder';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import { filterPracticeEntries, newestPracticeFirst, practiceTotals } from './practiceSelectors';

type Feedback = { id: string; comment: string; createdAt: string; audioUrl?: string };
type PracticeSortKey = 'date' | 'student' | 'topic' | 'minutes' | 'feedback';
type SortDirection = 'asc' | 'desc';
export default function PracticeReview({
  cloud,
  workspace,
  entries,
  students,
  onReload,
  showSummary = true,
}: {
  cloud: CloudSession;
  workspace: InstitutionId;
  entries: any[];
  students: any[];
  onReload: () => Promise<void>;
  showSummary?: boolean;
}) {
  const [open, setOpen] = useState(''),
    [comment, setComment] = useState(''),
    [feedbackAudio, setFeedbackAudio] = useState<File | null>(null),
    [feedbackAudioId, setFeedbackAudioId] = useState(''),
    [feedbackAudioUrl, setFeedbackAudioUrl] = useState(''),
    [feedback, setFeedback] = useState<Record<string, Feedback[]>>({}),
    [recordings, setRecordings] = useState<
      Record<string, Array<{ id: string; mime: string; createdAt: string; url: string }>>
    >({});
  const [studentId, setStudentId] = useState(''),
    [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<PracticeSortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const closeReviewButton = useRef<HTMLButtonElement>(null);
  const names = useMemo(
    () => new Map<string, string>(students.map((s) => [s.id, s.name])),
    [students],
  );
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 6 + i);
        return d.toISOString().slice(0, 10);
      }),
    [today],
  );
  const fullDate = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      ...options,
    });
  const start = period === 'week' ? days[0] : period === 'month' ? today.slice(0, 7) + '-01' : '';
  const scoped = useMemo(
    () =>
      newestPracticeFirst(
        showSummary
          ? entries.filter(
              (p) => String(p.date || '') <= today && (!start || String(p.date || '') >= start),
            )
          : entries,
      ),
    [entries, start, today, showSummary],
  );
  const shown = useMemo(
    () => filterPracticeEntries(scoped, studentId, search),
    [scoped, studentId, search],
  );
  const sortedShown = useMemo(() => {
    const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...shown].sort((a, b) => {
      let comparison = 0;
      if (sortKey === 'date') comparison = String(a.date || '').localeCompare(String(b.date || ''));
      else if (sortKey === 'student')
        comparison = collator.compare(
          names.get(a.studentId) || 'Student',
          names.get(b.studentId) || 'Student',
        );
      else if (sortKey === 'topic')
        comparison = collator.compare(a.topic || 'Practice', b.topic || 'Practice');
      else if (sortKey === 'minutes')
        comparison = (Number(a.minutes) || 0) - (Number(b.minutes) || 0);
      else {
        const aFeedback =
          a.teacherReviewed || a.teacherComments?.length ? 'Reviewed' : 'Needs review';
        const bFeedback =
          b.teacherReviewed || b.teacherComments?.length ? 'Reviewed' : 'Needs review';
        comparison = collator.compare(aFeedback, bFeedback);
      }
      if (comparison) return comparison * direction;
      return (
        String(b.date || '').localeCompare(String(a.date || '')) ||
        String(a.id || '').localeCompare(String(b.id || ''))
      );
    });
  }, [shown, names, sortKey, sortDirection]);
  const learnerSummary = useMemo(
    () =>
      students
        .filter((s) => entries.some((p) => p.studentId === s.id))
        .map((s) => {
          return {
            student: s,
            week: days.map((d) =>
              entries
                .filter((p) => p.studentId === s.id && p.date === d)
                .reduce((minutes, p) => minutes + (Number(p.minutes) || 0), 0),
            ),
          };
        }),
    [students, entries, days],
  );
  const scopeMinutes = scoped.reduce((n, p) => n + (Number(p.minutes) || 0), 0);
  const participantCount = new Set(
    scoped.filter((p) => Number(p.minutes) > 0).map((p) => p.studentId),
  ).size;
  const avgMinutes = participantCount ? Math.round(scopeMinutes / participantCount) : 0;
  const totals = useMemo(() => practiceTotals(entries), [entries]);
  useEffect(() => {
    setOpen('');
    setFeedback({});
    setRecordings({});
    setComment('');
    setFeedbackAudio(null);
    setFeedbackAudioId('');
    setFeedbackAudioUrl('');
    setNotice('');
    setError('');
    setStudentId('');
    setSearch('');
    setSortKey('date');
    setSortDirection('desc');
  }, [workspace]);
  useEffect(
    () => () => {
      if (feedbackAudioUrl) URL.revokeObjectURL(feedbackAudioUrl);
    },
    [feedbackAudioUrl],
  );
  const inspect = async (id: string) => {
    setOpen(id);
    setComment('');
    setFeedbackAudio(null);
    setFeedbackAudioId('');
    setFeedbackAudioUrl('');
    setNotice('');
    setError('');
    try {
      const [rows, audio] = await Promise.all([
        cloud.api.teacherPracticeComments(workspace, id),
        cloud.api.teacherPracticeMedia(workspace, id),
      ]);
      setFeedback((v) => ({ ...v, [id]: rows.records }));
      setRecordings((v) => ({ ...v, [id]: audio.records }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load comments');
    }
  };
  const submit = async (id: string) => {
    if (!comment.trim() || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let audioId = feedbackAudioId;
      if (feedbackAudio && !audioId) {
        const audioTypeByExtension: Record<string, string> = {
          mp3: 'audio/mpeg',
          m4a: 'audio/mp4',
          aac: 'audio/aac',
          wav: 'audio/wav',
        };
        const extension = feedbackAudio.name.split('.').pop()?.toLowerCase() || '';
        const mime = feedbackAudio.type.startsWith('audio/')
          ? feedbackAudio.type
          : audioTypeByExtension[extension] || '';
        if (!mime)
          throw new Error('The recorded audio format is not supported. Please record again.');
        const signed = await cloud.api.beginTeacherPracticeFeedbackAudio(
          workspace,
          id,
          mime,
          feedbackAudio.size,
        );
        const uploaded = await fetch(signed.uploadUrl, {
          method: 'PUT',
          headers: { ...signed.headers, 'Content-Type': mime },
          body: feedbackAudio,
        });
        if (!uploaded.ok) throw new Error(`Audio upload failed (${uploaded.status})`);
        const saved = await cloud.api.finishTeacherPracticeFeedbackAudio(workspace, id, signed.key);
        audioId = saved.audioId;
        setFeedbackAudioId(audioId);
      }
      await cloud.api.addTeacherPracticeComment(
        workspace,
        id,
        comment.trim(),
        audioId || undefined,
      );
      setComment('');
      setFeedbackAudio(null);
      setFeedbackAudioId('');
      setFeedbackAudioUrl('');
      await inspect(id);
      await onReload().catch(() => undefined);
      setNotice('Feedback saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save comment');
    } finally {
      setBusy(false);
    }
  };
  const closeReview = useCallback(() => {
    if (busy) return;
    setOpen('');
    setComment('');
    setFeedbackAudio(null);
    setFeedbackAudioId('');
    setFeedbackAudioUrl('');
  }, [busy]);
  const selected = entries.find((p) => p.id === open);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeReview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closeReview]);
  useEffect(() => {
    if (!open) return;
    closeReviewButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  const changeSort = (key: PracticeSortKey) => {
    if (key === sortKey) setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDirection(key === 'date' ? 'desc' : 'asc');
    }
  };
  const sortHeader = (key: PracticeSortKey, label: string) => {
    const active = sortKey === key;
    const directionLabel = sortDirection === 'asc' ? 'ascending' : 'descending';
    const Icon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th scope="col" aria-sort={active ? directionLabel : 'none'}>
        <button
          type="button"
          className="practice-sort-button"
          onClick={() => changeSort(key)}
          aria-label={`Sort by ${label}${active ? `, currently ${directionLabel}` : ''}`}
          title={`Sort by ${label}`}
        >
          {label}
          <Icon size={15} aria-hidden="true" />
        </button>
      </th>
    );
  };
  const selectedReviewed = Boolean(
    selected?.teacherReviewed || selected?.teacherComments?.length || feedback[open]?.length,
  );
  return (
    <section className="tw-review">
      {showSummary && (
        <>
          <div className="tw-section-head">
            <h2>Student practice</h2>
            <span>
              {totals.entries} entries · {totals.minutes} minutes
            </span>
          </div>
          <p className="tw-hint">
            Students and authorised guardians record practice. Review submissions and leave feedback
            here.
          </p>
          <div className="v1376-period">
            <span>Practice period</span>
            <div>
              <button
                type="button"
                aria-pressed={period === 'week'}
                onClick={() => setPeriod('week')}
              >
                Last 7 days
              </button>
              <button
                type="button"
                aria-pressed={period === 'month'}
                onClick={() => setPeriod('month')}
              >
                This month
              </button>
              <button
                type="button"
                aria-pressed={period === 'all'}
                onClick={() => setPeriod('all')}
              >
                All time
              </button>
            </div>
          </div>
          <div className="v1376-stats">
            <div>
              <small>Total minutes</small>
              <strong>{scopeMinutes}</strong>
            </div>
            <div>
              <small>Students practised</small>
              <strong>
                {participantCount} / {new Set(entries.map((p) => p.studentId)).size}
              </strong>
            </div>
            <div>
              <small>Avg minutes / participant</small>
              <strong>{avgMinutes}</strong>
            </div>
          </div>
          <section className="v1376-consistency" aria-label="Weekly practice consistency">
            <div className="v1376-section-top">
              <h3>Weekly practice consistency</h3>
              <small>
                Daily recorded minutes · {fullDate(days[0])}–
                {fullDate(days[6], { year: 'numeric' })}
              </small>
            </div>
            {learnerSummary.length ? (
              <>
                {learnerSummary.map((row) => (
                  <div className="v1376-learner-row" key={row.student.id}>
                    <div className="v1376-learner-head">
                      <strong>
                        {row.student.name}
                        {row.student.rollNumber ? ` · ${row.student.rollNumber}` : ''}
                      </strong>
                      <small>
                        {row.week.filter((v) => v > 0).length}/7 days ·{' '}
                        {row.week.reduce((a, b) => a + b, 0)} min
                      </small>
                    </div>
                    <div className="v1376-week">
                      {row.week.map((mins, i) => (
                        <div
                          key={days[i]}
                          title={`${days[i]} · ${mins} minutes`}
                          className={
                            mins === 0
                              ? 'v1376-none'
                              : mins < 15
                                ? 'v1376-low'
                                : mins < 30
                                  ? 'v1376-medium'
                                  : 'v1376-high'
                          }
                        >
                          <span>{fullDate(days[i])}</span>
                          <strong>{mins || '—'}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="tw-hint">No recorded practice for this class.</p>
            )}
            <p className="tw-hint">
              An empty day means no practice was logged, not necessarily that no practice occurred.
            </p>
          </section>
        </>
      )}
      <h3>{showSummary ? 'Practice entries & teacher feedback' : 'Practice entries'}</h3>

      {!entries.length ? (
        <div className="tw-practice-empty" role="status">
          <BookOpenCheck size={28} aria-hidden="true" />
          <strong>No practice recorded yet</strong>
          <p>
            When students or guardians submit practice for this class, entries will appear here for
            review and feedback.
          </p>
        </div>
      ) : (
        <>
          <div className="tw-practice-filters">
            <label>
              Student{' '}
              <select
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setOpen('');
                }}
              >
                <option value="">All students</option>
                {students
                  .filter((s) => entries.some((p) => p.studentId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.rollNumber ? ` · ${s.rollNumber}` : ''}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Search practice{' '}
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOpen('');
                }}
                placeholder="Topic, notes or date"
              />
            </label>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {sortHeader('date', 'Date')}
                  {sortHeader('student', 'Student')}
                  {sortHeader('topic', 'Topic')}
                  {sortHeader('minutes', 'Minutes')}
                  {sortHeader('feedback', 'Feedback')}
                </tr>
              </thead>
              <tbody>
                {sortedShown.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    aria-label={`Open practice review for ${names.get(p.studentId) || 'student'} on ${p.date}`}
                    onClick={() => void inspect(p.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void inspect(p.id);
                      }
                    }}
                    className="practice-review-row"
                  >
                    <td>{p.date}</td>
                    <td>{names.get(p.studentId) || 'Student'}</td>
                    <td>{p.topic || 'Practice'}</td>
                    <td>{p.minutes || 0}</td>
                    <td>
                      {p.teacherReviewed || p.teacherComments?.length ? (
                        <button
                          type="button"
                          className="practice-review-status is-reviewed practice-review-action"
                          aria-label={`View reviewed practice for ${names.get(p.studentId) || 'student'} on ${p.date}`}
                          aria-pressed={open === p.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void inspect(p.id);
                          }}
                        >
                          Reviewed · View
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="practice-review-status is-pending practice-review-action"
                          aria-pressed={open === p.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void inspect(p.id);
                          }}
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && <p className="tw-hint">No practice matches these filters.</p>}
          {open && selected && (
            <div
              className="tw-practice-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeReview();
              }}
            >
              <section
                className="tw-practice-feedback"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tw-practice-review-title"
              >
                <header className="tw-practice-feedback-head">
                  <div>
                    <h3 id="tw-practice-review-title">
                      Practice review · {names.get(selected.studentId) || 'student'} ·{' '}
                      {selected.date}
                    </h3>
                    <p className="tw-hint">
                      {selected.topic || 'Practice'} · {selected.minutes || 0} minutes
                    </p>
                  </div>
                  <button
                    type="button"
                    className="tw-practice-modal-close"
                    aria-label="Close practice review"
                    title="Close review"
                    ref={closeReviewButton}
                    disabled={busy}
                    onClick={closeReview}
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>
                <section className="tw-practice-student-notes" aria-label="Student notes">
                  <strong>Student notes</strong>
                  <textarea
                    className="tw-practice-notes-box"
                    aria-label="Student practice notes"
                    readOnly
                    rows={4}
                    value={selected.comments?.trim() || 'No notes added for this practice.'}
                  />
                </section>
                <div className="tw-practice-recordings">
                  <strong>Practice attachments</strong>
                  {recordings[open]?.length ? (
                    recordings[open].map((r) => (
                      <div key={r.id}>
                        <small>{new Date(r.createdAt).toLocaleString()}</small>
                        {r.mime.startsWith('image/') ? (
                          <a href={r.url} target="_blank" rel="noreferrer">
                            <img src={r.url} alt={`Student practice image from ${selected.date}`} />
                          </a>
                        ) : r.mime.startsWith('audio/') ? (
                          <audio
                            controls
                            preload="none"
                            aria-label={`Practice audio for ${names.get(selected.studentId) || 'student'} on ${selected.date}`}
                            src={r.url}
                          />
                        ) : r.mime.startsWith('video/') ? (
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            aria-label={`Practice video for ${names.get(selected.studentId) || 'student'} on ${selected.date}`}
                          >
                            <source src={r.url} type={r.mime} />
                            Your browser cannot play this video.{' '}
                            <a href={r.url} target="_blank" rel="noreferrer">
                              Open video
                            </a>
                          </video>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="tw-hint">No attachments for this practice.</p>
                  )}
                </div>
                {feedback[open]?.map((f) => (
                  <p key={f.id}>
                    {f.comment} <small>· {f.createdAt.slice(0, 10)}</small>
                    {f.audioUrl && (
                      <audio
                        controls
                        preload="none"
                        src={f.audioUrl}
                        aria-label="Teacher audio feedback"
                      />
                    )}
                  </p>
                ))}
                {feedback[open]?.length === 0 && <p>No teacher comments yet.</p>}
                {selectedReviewed ? (
                  <p className="tw-hint" role="status">
                    This practice has been reviewed and is read-only.
                  </p>
                ) : (
                  <>
                    <label htmlFor="teacher-comment">
                      Add comment <span className="tw-required-label">(required)</span>
                    </label>
                    <textarea
                      id="teacher-comment"
                      required
                      aria-required="true"
                      maxLength={1000}
                      value={comment}
                      onChange={(e) => {
                        setComment(e.target.value);
                        setNotice('');
                        setError('');
                      }}
                      placeholder="Feedback on the student's practice"
                    />
                    <div className="tw-feedback-audio-picker">
                      <span>
                        Audio feedback <small>Optional</small>
                      </span>
                      <AudioFeedbackRecorder
                        disabled={busy}
                        onRecording={(file) => {
                          if (feedbackAudioUrl) URL.revokeObjectURL(feedbackAudioUrl);
                          setFeedbackAudio(file);
                          setFeedbackAudioId('');
                          setFeedbackAudioUrl(URL.createObjectURL(file));
                          setNotice('');
                          setError('');
                        }}
                      />
                    </div>
                    {feedbackAudioUrl && (
                      <div className="tw-feedback-audio-preview">
                        <span>{feedbackAudio?.name}</span>
                        <audio controls preload="metadata" src={feedbackAudioUrl} />
                      </div>
                    )}
                  </>
                )}
                {error && (
                  <p role="alert" className="sadhana-sync-error">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="tw-feedback-saved" role="status">
                    {notice}
                  </p>
                )}
                <div className="tw-feedback-actions">
                  {!selectedReviewed && (
                    <button
                      type="button"
                      className={`reg-primary${notice ? ' is-saved' : ''}`}
                      disabled={busy || Boolean(notice) || !comment.trim()}
                      onClick={() => void submit(open)}
                    >
                      {busy ? 'Saving…' : notice ? 'Saved' : 'Save comment'}
                    </button>
                  )}
                  {selectedReviewed && notice && (
                    <button type="button" className="reg-primary is-saved" disabled>
                      Saved
                    </button>
                  )}
                  <button
                    type="button"
                    className="reg-secondary"
                    disabled={busy}
                    onClick={closeReview}
                  >
                    Close
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
