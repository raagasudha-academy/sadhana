import './homeworkIcons.css';
import { useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import {
  homeworkFileAllowed,
  homeworkMimeForFile,
  homeworkMediaAccept,
  homeworkSelectionAllowed,
} from './homeworkMediaPolicy';

export { homeworkFileAllowed, homeworkSelectionAllowed };

type Material = { id: string; mime: string; size: number; url: string };
export const homeworkMediaKind = (mime: string) =>
  mime.startsWith('image/')
    ? 'Image'
    : mime.startsWith('audio/')
      ? 'Audio'
      : mime.startsWith('video/')
        ? 'Video'
        : 'Previous attachment';
export function HomeworkMediaPreview({
  mime,
  url,
  alt,
}: {
  mime: string;
  url: string;
  alt: string;
}) {
  if (mime.startsWith('image/'))
    return (
      <a href={url} target="_blank" rel="noreferrer" aria-label={`Enlarge ${alt}`}>
        <img className="sadhana-homework-image" src={url} alt={alt} loading="lazy" />
      </a>
    );
  if (mime.startsWith('audio/'))
    return <audio controls preload="none" aria-label={alt} src={url} />;
  if (mime.startsWith('video/'))
    return <video controls playsInline preload="metadata" aria-label={alt} src={url} />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      Previous attachment ({mime})
    </a>
  );
}
/** Teacher materials are private assignment resources, separate from student submission evidence. */
export function TeacherHomeworkMaterials({
  cloud,
  inst,
  classId,
  homeworkId,
  initialVersion,
  editable,
}: {
  cloud: CloudSession;
  inst: InstitutionId;
  classId: string;
  homeworkId: string;
  initialVersion: number;
  editable: boolean;
}) {
  const [records, setRecords] = useState<Material[]>([]),
    [version, setVersion] = useState(initialVersion),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<Array<{ id: string; mime: string }>>([]);
  const currentMaterialMimes = [
    ...records.map((record) => record.mime),
    ...pending.map((record) => record.mime),
  ];
  const reload = async () => {
    const data = await cloud.api.teacherHomeworkMaterialLinks(inst, classId, homeworkId);
    setRecords(data.records);
    setPending([]);
  };
  useEffect(() => {
    setVersion(initialVersion);
    setError('');
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : 'Unable to load attachments'),
    );
  }, [cloud, inst, classId, homeworkId, initialVersion]);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    const selectedFiles = Array.from(files);
    setBusy(true);
    setError('');
    const uploaded: Array<{ id: string; mime: string }> = [];
    try {
      const mimes = [...records.map((r) => r.mime), ...pending.map((r) => r.mime)];
      const nextMimes = [...mimes, ...selectedFiles.map(homeworkMimeForFile)];
      if (
        selectedFiles.some((file) => !homeworkFileAllowed(file)) ||
        !homeworkSelectionAllowed(nextMimes)
      )
        throw Error('Choose up to 4 attachments. Check that each file type and size is supported.');
      for (const file of selectedFiles) {
        const mime = homeworkMimeForFile(file);
        const signed = await cloud.api.beginTeacherHomeworkMaterial(
          inst,
          classId,
          homeworkId,
          mime,
          file.size,
        );
        const response = await fetch(signed.uploadUrl, {
          method: 'PUT',
          headers: { ...signed.headers, 'Content-Type': mime },
          body: file,
        });
        if (!response.ok) throw Error(`Upload failed (${response.status})`);
        const saved = await cloud.api.finishTeacherHomeworkMaterial(
          inst,
          classId,
          homeworkId,
          signed.key,
        );
        uploaded.push({ id: saved.record.id, mime: saved.record.mime });
      }
      setPending((p) => [...p, ...uploaded]);
    } catch (e) {
      if (uploaded.length) setPending((p) => [...p, ...uploaded]);
      setError(e instanceof Error ? e.message : 'Could not upload material');
    } finally {
      setBusy(false);
    }
  };
  const save = async (ids: string[]) => {
    setBusy(true);
    setError('');
    try {
      await cloud.api.setTeacherHomeworkMaterials(inst, classId, homeworkId, ids, version);
      setVersion((v) => v + 1);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update attachments; refresh assignment');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sadhana-homework-materials">
      <h4>Attachments</h4>
      <p>Up to 4 attachments, including images, audio, or video. Available to enrolled learners.</p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            <a href={r.url} target="_blank" rel="noreferrer">
              {homeworkMediaKind(r.mime)} · {(r.size / 1_000_000).toFixed(1)} MB
            </a>
            {editable && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save([
                    ...records.filter((x) => x.id !== r.id).map((x) => x.id),
                    ...pending.map((x) => x.id),
                  ])
                }
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <p>
          {pending.length} new attachment(s) uploaded privately; click Save attachments to publish
          them.
        </p>
      )}
      {editable && (
        <>
          <label className="sadhana-attachment-add">
            <UploadCloud size={19} />
            <span>Add attachments</span>
            <input
              type="file"
              multiple
              accept={homeworkMediaAccept}
              aria-label="Add assignment attachments"
              disabled={busy || currentMaterialMimes.length >= 4}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || !pending.length}
            onClick={() => void save([...records.map((r) => r.id), ...pending.map((r) => r.id)])}
          >
            Save attachments
          </button>
        </>
      )}
    </div>
  );
}
export function LearnerHomeworkMaterials({
  cloud,
  inst,
  studentId,
  homeworkId,
}: {
  cloud: CloudSession;
  inst: InstitutionId;
  studentId: string;
  homeworkId: string;
}) {
  const [records, setRecords] = useState<Material[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setRecords([]);
    setError('');
    void cloud.api
      .learnerHomeworkMaterialLinks(inst, studentId, homeworkId)
      .then((x) => {
        if (alive) setRecords(x.records);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Attachments unavailable');
      });
    return () => {
      alive = false;
    };
  }, [cloud, inst, studentId, homeworkId]);
  return (
    <div className="sadhana-homework-materials">
      <h4>Attachments</h4>
      {error && <p role="alert">{error}</p>}
      {!records.length && !error && <p>No attachments yet.</p>}
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            <HomeworkMediaPreview mime={r.mime} url={r.url} alt="Assignment attachment" />
          </li>
        ))}
      </ul>
    </div>
  );
}
