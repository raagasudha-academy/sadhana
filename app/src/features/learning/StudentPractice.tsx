import { useEffect, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import AudioFeedbackRecorder from '../../AudioFeedbackRecorder';
import {
  homeworkFileAllowed,
  homeworkMediaAccept,
  homeworkMimeForFile,
} from '../../homeworkMediaPolicy';
import type { PracticeMediaFiles, StudentPortalContext } from './useStudentPortalController';

function PracticeMediaPicker({
  files,
  addFiles,
  removeFile,
  existingCount,
  disabled,
  onInvalid,
}: {
  files: PracticeMediaFiles;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  existingCount: number;
  disabled: boolean;
  onInvalid: (message: string) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const acceptFiles = (selected: FileList | File[]) => {
    const incoming = Array.from(selected);
    if (existingCount + files.length + incoming.length > 4) {
      onInvalid('Add up to four attachments. Remove one before adding more.');
      return;
    }
    const invalid = incoming.find((file) => !homeworkFileAllowed(file));
    if (invalid) {
      onInvalid(
        'Choose a supported image (5 MB; HEIC/HEIF 10 MB), audio (20 MB), or video (100 MB).',
      );
      return;
    }
    addFiles(incoming);
  };
  return (
    <section className="v1376-practice-media" aria-label="Practice attachments">
      <div className="v1376-practice-media-heading">
        <div>
          <strong>Attachments · {existingCount + files.length}/4</strong>
          <span>Add up to four files to this practice entry.</span>
        </div>
      </div>
      <input
        id="practice-attachments-picker"
        className="v1376-practice-media-input"
        type="file"
        accept={homeworkMediaAccept}
        multiple
        disabled={disabled || existingCount + files.length >= 4}
        aria-label="Add attachments to practice"
        onChange={(event) => {
          if (event.currentTarget.files) acceptFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <div className="v1376-practice-attachment-actions">
        <label
          htmlFor="practice-attachments-picker"
          className={`v1376-practice-attachment-button${disabled || existingCount + files.length >= 4 ? ' is-disabled' : ''}`}
        >
          <Paperclip size={17} /> Add attachments
        </label>
        <AudioFeedbackRecorder
          label="Record an audio attachment"
          startText="Record audio"
          stopText="Stop recording"
          disabled={disabled || existingCount + files.length >= 4}
          onRecording={(file) => acceptFiles([file])}
        />
      </div>
      {!!files.length && (
        <div className="v1376-practice-attachment-list">
          {files.map((file, index) => {
            const mime = homeworkMimeForFile(file);
            const url = previews[index];
            return (
              <div
                className="v1376-practice-attachment"
                key={`${file.name}-${file.lastModified}-${index}`}
              >
                {mime.startsWith('image/') ? (
                  <img src={url} alt={file.name} />
                ) : mime.startsWith('audio/') ? (
                  <audio controls preload="metadata" src={url} aria-label={file.name} />
                ) : mime.startsWith('video/') ? (
                  <video controls preload="metadata" playsInline src={url} aria-label={file.name} />
                ) : null}
                <span title={file.name}>{file.name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeFile(index)}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function StudentPractice({ context }: { context: StudentPortalContext }) {
  const {
    uploadBusy,
    media,
    detail,
    edit,
    setEdit,
    todayUK,
    classId,
    setClassId,
    date,
    setDate,
    minutes,
    setMinutes,
    topic,
    setTopic,
    notes,
    setNotes,
    savePractice,
    practiceMediaFiles,
    addPracticeMediaFiles,
    removePracticeMediaFile,
    pendingPracticeMediaId,
    setError,
  } = context;
  const linkedPracticeId = pendingPracticeMediaId || edit?.id || '';
  return (
    <section className="v1376-practice-page">
      <div className="v1376-practice-heading">
        <div>
          <h3>Log practice</h3>
          <p>Keep track of your daily learning, one session at a time.</p>
        </div>
      </div>
      {!detail.classes.length && (
        <p role="status">Practice logging is available after joining a class.</p>
      )}
      <form
        onSubmit={(e) => void savePractice(e)}
        className="access-practice-form sv1276-practice-form"
      >
        <label>
          Class{' '}
          <select required value={classId} onChange={(e) => setClassId(e.target.value)}>
            {detail.classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.className}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Minutes{' '}
          <input
            type="number"
            min={1}
            max={1440}
            required
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          Topic{' '}
          <input
            maxLength={200}
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label>
          Notes{' '}
          <textarea
            rows={4}
            maxLength={1500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional details about today’s practice"
          />
        </label>
        <PracticeMediaPicker
          files={practiceMediaFiles}
          addFiles={addPracticeMediaFiles}
          removeFile={removePracticeMediaFile}
          existingCount={
            linkedPracticeId
              ? media.filter(
                  (item) => item.purpose === 'practice' && item.practiceId === linkedPracticeId,
                ).length
              : 0
          }
          disabled={uploadBusy}
          onInvalid={setError}
        />
        <button type="submit" disabled={!detail.classes.length || uploadBusy}>
          {uploadBusy
            ? 'Uploading attachments…'
            : pendingPracticeMediaId
              ? 'Retry media upload'
              : edit
                ? 'Save correction'
                : 'Record practice'}
        </button>
        {edit && (
          <button
            type="button"
            onClick={() => {
              setEdit(null);
              setTopic('');
              setNotes('');
            }}
          >
            Cancel correction
          </button>
        )}
      </form>
      <div className="v1376-practice-history-head">
        <h3>Practice history</h3>
        <span>Your recorded sessions</span>
      </div>
      <div className="v1376-practice-history-list">
        {detail.practice.map((r) => {
          const practiceMedia = (media || []).filter(
            (m: any) => m.purpose === 'practice' && m.practiceId === r.id,
          );
          const teacherComments = r.teacherComments || [];
          const reviewed = teacherComments.length > 0;
          const editDisabled = r.date < todayUK() || reviewed;
          return (
            <article className="v1376-practice-history-entry" key={r.id}>
              <header className="v1376-practice-history-entry-head">
                <div className="v1376-practice-history-meta">
                  <time dateTime={r.date}>{r.date}</time>
                  <span>{r.minutes} min</span>
                </div>
                <button
                  type="button"
                  disabled={editDisabled}
                  title={
                    reviewed
                      ? 'Reviewed by teacher; corrections locked'
                      : r.date < todayUK()
                        ? 'Practice date has passed'
                        : undefined
                  }
                  onClick={() => {
                    setEdit({ id: r.id, version: r.version });
                    setClassId(r.classId);
                    setDate(r.date);
                    setMinutes(r.minutes);
                    setTopic(r.topic);
                    setNotes(r.comments);
                  }}
                >
                  Edit submission
                </button>
              </header>
              <div className="v1376-practice-history-content">
                <div className="v1376-practice-history-topic">
                  <span className="v1376-practice-history-media-label">Topic</span>
                  <strong>{r.topic || 'Practice session'}</strong>
                </div>
                <div className="v1376-practice-history-media-row">
                  <span className="v1376-practice-history-media-label">Attachments</span>
                  <div className="v1376-practice-history-attachments">
                    {practiceMedia.length > 0 ? (
                      practiceMedia.map((m: any) => (
                        <div className="v1376-practice-history-attachment" key={m.id}>
                          {m.mime?.startsWith('image/') ? (
                            <a href={m.url} target="_blank" rel="noreferrer">
                              <img src={m.url} alt="Practice attachment" />
                            </a>
                          ) : m.mime?.startsWith('audio/') ? (
                            <audio
                              controls
                              preload="none"
                              src={m.url}
                              aria-label="Practice audio attachment"
                            />
                          ) : m.mime?.startsWith('video/') ? (
                            <video
                              controls
                              preload="metadata"
                              playsInline
                              src={m.url}
                              aria-label="Practice video attachment"
                            />
                          ) : (
                            <span>
                              <Paperclip size={16} /> Attachment
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="v1376-practice-no-attachments">No attachments</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="v1376-practice-history-feedback">
                {reviewed ? (
                  <>
                    <span className="practice-review-status is-reviewed">Reviewed</span>
                    {teacherComments.map((comment) => (
                      <div key={comment.id}>
                        {comment.comment && <p>{comment.comment}</p>}
                        {comment.audioUrl && (
                          <audio
                            controls
                            preload="none"
                            src={comment.audioUrl}
                            aria-label="Teacher audio feedback"
                          />
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <span className="practice-review-status is-pending">
                    Awaiting teacher feedback
                  </span>
                )}
              </div>
            </article>
          );
        })}
        {!detail.practice.length && (
          <div className="v1376-practice-history-empty">
            <strong>No practice sessions recorded yet</strong>
            <span>Your submitted sessions will appear here with teacher feedback.</span>
          </div>
        )}
      </div>
    </section>
  );
}
