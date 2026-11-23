import { useEffect, useRef, useState } from 'react';
import { Music2, Paperclip, X } from 'lucide-react';
import AudioFeedbackRecorder from '../../AudioFeedbackRecorder';
import {
  homeworkFileAllowed,
  homeworkMediaAccept,
  homeworkMimeForFile,
} from '../../homeworkMediaPolicy';
import type { PracticeMediaFiles, StudentPortalContext } from './useStudentPortalController';

type ExistingPracticeMedia = { id: string; mime: string; url: string };

function PracticeHistoryAudioUpload({
  disabled,
  onUpload,
}: {
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        className="v1376-practice-history-audio-input"
        type="file"
        accept="audio/mpeg,audio/mp4,audio/webm,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.webm,.aac,.wav"
        disabled={disabled}
        aria-label="Choose practice audio attachment"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = '';
        }}
      />
      <button
        className="v1376-practice-history-audio-button"
        type="button"
        disabled={disabled}
        title={disabled ? 'This practice has been reviewed; attachments are locked.' : 'Add audio'}
        onClick={() => input.current?.click()}
      >
        <Music2 size={17} /> Add audio
      </button>
    </>
  );
}

function PracticeMediaPicker({
  files,
  addFiles,
  removeFile,
  existingMedia,
  onRemoveExisting,
  removingMediaId,
  existingCount,
  disabled,
  onInvalid,
}: {
  files: PracticeMediaFiles;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  existingMedia: ExistingPracticeMedia[];
  onRemoveExisting: (mediaId: string) => void;
  removingMediaId: string;
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
      {!!existingMedia.length && (
        <div className="v1376-practice-attachment-list" aria-label="Existing practice attachments">
          {existingMedia.map((media) => (
            <div className="v1376-practice-attachment" key={media.id}>
              {media.mime.startsWith('image/') ? (
                <a href={media.url} target="_blank" rel="noreferrer">
                  <img src={media.url} alt="Existing practice attachment" />
                </a>
              ) : media.mime.startsWith('audio/') ? (
                <audio
                  controls
                  preload="none"
                  src={media.url}
                  aria-label="Existing practice audio attachment"
                />
              ) : media.mime.startsWith('video/') ? (
                <video
                  controls
                  preload="metadata"
                  playsInline
                  src={media.url}
                  aria-label="Existing practice video attachment"
                />
              ) : (
                <span>
                  <Paperclip size={16} /> Existing attachment
                </span>
              )}
              <span>
                {media.mime.startsWith('audio/')
                  ? 'Existing audio'
                  : media.mime.startsWith('video/')
                    ? 'Existing video'
                    : 'Existing image'}
              </span>
              <button
                type="button"
                disabled={disabled || removingMediaId === media.id}
                aria-label="Delete existing practice attachment"
                title="Delete existing attachment"
                onClick={() => onRemoveExisting(media.id)}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
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
    removingPracticeMediaId,
    uploadEvidence,
    removePracticeMedia,
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
    deletePractice,
    deletingPractice,
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
          existingMedia={
            edit
              ? media.filter((item) => item.purpose === 'practice' && item.practiceId === edit.id)
              : []
          }
          onRemoveExisting={(mediaId) => {
            if (
              window.confirm(
                'Delete this attachment from the practice submission? This cannot be undone.',
              )
            )
              void removePracticeMedia(mediaId);
          }}
          removingMediaId={removingPracticeMediaId}
          existingCount={
            linkedPracticeId
              ? media.filter(
                  (item) => item.purpose === 'practice' && item.practiceId === linkedPracticeId,
                ).length
              : 0
          }
          disabled={uploadBusy || deletingPractice || !!removingPracticeMediaId}
          onInvalid={setError}
        />
        <button type="submit" disabled={!detail.classes.length || uploadBusy || deletingPractice}>
          {uploadBusy
            ? 'Uploading attachments…'
            : pendingPracticeMediaId
              ? 'Retry media upload'
              : edit
                ? 'Save correction'
                : 'Record practice'}
        </button>
        {edit && (
          <>
            <button
              type="button"
              onClick={() => {
                setEdit(null);
                setTopic('');
                setNotes('');
              }}
              disabled={deletingPractice || uploadBusy}
            >
              Cancel correction
            </button>
            <button
              type="button"
              className="v1376-practice-delete-button"
              disabled={deletingPractice || uploadBusy}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete this practice submission and its attachments? This cannot be undone.',
                  )
                )
                  void deletePractice();
              }}
            >
              {deletingPractice ? 'Deleting…' : 'Delete submission'}
            </button>
          </>
        )}
      </form>
      <div className="v1376-practice-history-head">
        <h3>Practice history</h3>
        <span>Your recorded sessions</span>
      </div>
      <div className="v1376-practice-history-list">
        {[...detail.practice]
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
          .map((r) => {
            const practiceMedia = (media || []).filter(
              (m: any) => m.purpose === 'practice' && m.practiceId === r.id,
            );
            const teacherComments = r.teacherComments || [];
            const reviewed = r.teacherReviewed === true || teacherComments.length > 0;
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
                  {!practiceMedia.some((item: any) => item.mime?.startsWith('audio/')) && (
                    <div className="v1376-practice-history-media-row">
                      <span className="v1376-practice-history-media-label">Audio</span>
                      <div>
                        <PracticeHistoryAudioUpload
                          disabled={uploadBusy || reviewed}
                          onUpload={(file) => void uploadEvidence(file, 'practice', r.id)}
                        />
                      </div>
                    </div>
                  )}
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
