import './homeworkIcons.css';
import { useEffect, useState } from 'react';
import { Image, Music2, Video } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import {
  homeworkFileAllowed,
  homeworkMimeForFile,
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
const canAdd = (mimes: string[], file: File) =>
  homeworkFileAllowed(file) && homeworkSelectionAllowed([...mimes, homeworkMimeForFile(file)]);
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
      setError(e instanceof Error ? e.message : 'Unable to load materials'),
    );
  }, [cloud, inst, classId, homeworkId, initialVersion]);
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const mimes = [...records.map((r) => r.mime), ...pending.map((r) => r.mime)];
      if (!canAdd(mimes, file)) throw Error('Attach up to 2 images, 1 audio file and 1 video.');
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
      setPending((p) => [...p, { id: saved.record.id, mime: saved.record.mime }]);
    } catch (e) {
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
      setError(e instanceof Error ? e.message : 'Could not update materials; refresh assignment');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sadhana-homework-materials">
      <h4>Assignment materials</h4>
      <p>Optional: 2 images, 1 audio file and 1 video. Available to enrolled learners.</p>
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
          {pending.length} new file(s) uploaded privately; click Save materials to publish them.
        </p>
      )}
      {editable && (
        <>
          <div className="sadhana-homework-upload-grid" aria-label="Upload teacher materials">
            <label
              className={
                currentMaterialMimes.some((mime) => mime.startsWith('image/')) ? 'has-file' : ''
              }
            >
              <Image size={22} />
              Image 1
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                aria-label="Add homework image 1"
                disabled={
                  busy ||
                  currentMaterialMimes.filter((mime) => mime.startsWith('image/')).length >= 1
                }
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
            <label
              className={
                currentMaterialMimes.filter((mime) => mime.startsWith('image/')).length > 1
                  ? 'has-file'
                  : ''
              }
            >
              <Image size={22} />
              Image 2
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
                aria-label="Add homework image 2"
                disabled={
                  busy ||
                  currentMaterialMimes.filter((mime) => mime.startsWith('image/')).length >= 2
                }
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
            <label
              className={
                currentMaterialMimes.some((mime) => mime.startsWith('audio/')) ? 'has-file' : ''
              }
            >
              <Music2 size={22} />
              Audio
              <input
                type="file"
                accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav"
                aria-label="Add homework audio"
                disabled={busy || currentMaterialMimes.some((mime) => mime.startsWith('audio/'))}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
            <label
              className={
                currentMaterialMimes.some((mime) => mime.startsWith('video/')) ? 'has-file' : ''
              }
            >
              <Video size={22} />
              Video
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/3gpp,.mp4,.mov,.3gp"
                aria-label="Add homework video"
                disabled={busy || currentMaterialMimes.some((mime) => mime.startsWith('video/'))}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !pending.length}
            onClick={() => void save([...records.map((r) => r.id), ...pending.map((r) => r.id)])}
          >
            Save materials
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
        if (alive) setError(e instanceof Error ? e.message : 'Materials unavailable');
      });
    return () => {
      alive = false;
    };
  }, [cloud, inst, studentId, homeworkId]);
  return (
    <div className="sadhana-homework-materials">
      <h4>Teacher materials</h4>
      {error && <p role="alert">{error}</p>}
      {!records.length && !error && <p>No attached materials.</p>}
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            <HomeworkMediaPreview mime={r.mime} url={r.url} alt="Teacher homework image" />
          </li>
        ))}
      </ul>
    </div>
  );
}
