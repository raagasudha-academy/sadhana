import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { CloudSession } from '../../CloudAuth';
import type { InstitutionId } from '../../types';
import './syllabusLibrary.css';

type Category = 'syllabus' | 'getting-started' | 'practice' | 'policies';
type Audience = 'students' | 'families' | 'all';
type Status = 'draft' | 'published' | 'archived';
type LibraryTab = 'syllabus' | 'resources';
type Resource = {
  id: string;
  title: string;
  description: string;
  category: Category;
  audience: Audience;
  url: string;
  classIds: string[];
  programme: string;
  stage: string;
  levelNumber: number | null;
  studentMessage: string;
  objective: string;
  duration: string;
  expectedOutcome: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  hasFile: boolean;
  versionLabel: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  version: number;
  canManage: boolean;
};
type JourneyStage = {
  programme: string;
  stage: string;
  levelNumber: number | null;
  published: boolean;
};
type Draft = {
  title: string;
  description: string;
  category: Category;
  audience: Audience;
  url: string;
  classIds: string[];
  programme: string;
  stage: string;
  levelNumber: string;
  studentMessage: string;
  objective: string;
  duration: string;
  expectedOutcome: string;
  versionLabel: string;
  status: Status;
};
type ClassOption = { classId: string; name: string };
const blank: Draft = {
  title: '',
  description: '',
  category: 'syllabus',
  audience: 'all',
  url: '',
  classIds: [],
  programme: '',
  stage: '',
  levelNumber: '',
  studentMessage: '',
  objective: '',
  duration: '',
  expectedOutcome: '',
  versionLabel: '',
  status: 'draft',
};
const groups: Array<{ id: Category; label: string }> = [
  { id: 'syllabus', label: 'Syllabus' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'practice', label: 'Practice resources' },
  { id: 'policies', label: 'Policies & forms' },
];
const statusLabel: Record<Status, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};
const isPravesha = (stage: string, levelNumber: number | null) =>
  levelNumber === 0 ||
  stage
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{Diacritic}/gu, '')
    .startsWith('pravesha');

export default function SyllabusLibrary({
  cloud,
  institution,
  studentId,
  canEdit = false,
  canEditSyllabus = canEdit,
  canManageResources = canEdit,
  showHeading = true,
}: {
  cloud: CloudSession;
  institution: InstitutionId;
  studentId?: string;
  canEdit?: boolean;
  canEditSyllabus?: boolean;
  canManageResources?: boolean;
  showHeading?: boolean;
}) {
  const [records, setRecords] = useState<Resource[]>([]);
  const [journeyStages, setJourneyStages] = useState<JourneyStage[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [activeTab, setActiveTab] = useState<LibraryTab>('syllabus');
  const admin = canEditSyllabus;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [result, classResult] = await Promise.all([
        cloud.api.listLearningResources(institution, studentId),
        cloud.api.listLearningResourceClasses(institution, studentId),
      ]);
      setRecords(result.records);
      setJourneyStages(result.stages || []);
      setClasses(classResult.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load learning resources.');
    } finally {
      setBusy(false);
    }
  }, [cloud.api, institution, studentId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const classNames = useMemo(
    () => new Map(classes.map((item) => [item.classId, item.name])),
    [classes],
  );
  const openNew = () => {
    setEditing(null);
    setFile(null);
    setForm({ ...blank, category: activeTab === 'syllabus' ? 'syllabus' : 'getting-started' });
  };
  const openEdit = (record: Resource) => {
    setActiveTab(record.category === 'syllabus' ? 'syllabus' : 'resources');
    setEditing(record);
    setFile(null);
    setForm({
      title: record.title,
      description: record.description,
      category: record.category,
      audience: record.audience,
      url: record.hasFile ? '' : record.url,
      classIds: record.classIds || [],
      programme: record.programme || '',
      stage: record.stage || '',
      levelNumber: record.levelNumber == null ? '' : String(record.levelNumber),
      studentMessage: record.studentMessage || '',
      objective: record.objective || '',
      duration: record.duration || '',
      expectedOutcome: record.expectedOutcome || '',
      versionLabel: record.versionLabel,
      status: record.status,
    });
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      let media:
        { mediaKey: string; fileName: string; mimeType: string; fileSize: number } | undefined;
      if (file) {
        const upload = await cloud.api.beginLearningResourceUpload(institution, {
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
          category: form.category,
          classIds: form.classIds,
        });
        const response = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: upload.headers,
          body: file,
        });
        if (!response.ok) throw new Error('The file upload did not complete. Try again.');
        media = {
          mediaKey: upload.key,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        };
      }
      const data = {
        ...form,
        ...(form.category === 'syllabus' &&
        (form.expectedOutcome.trim() || editing?.expectedOutcome)
          ? { expectedOutcome: form.expectedOutcome }
          : { expectedOutcome: undefined }),
        url: form.url.trim(),
        ...(form.category === 'syllabus'
          ? { levelNumber: Number(form.levelNumber) }
          : { programme: undefined, stage: undefined, levelNumber: undefined }),
        ...(media || {}),
      };
      if (editing)
        await cloud.api.updateLearningResource(institution, editing.id, {
          ...data,
          status: form.status,
          expectedVersion: editing.version,
        });
      else await cloud.api.createLearningResource(institution, data);
      setForm(null);
      setEditing(null);
      setFile(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save this resource.');
    } finally {
      setSaving(false);
    }
  };
  const changeStatus = async (record: Resource, status: Status) => {
    setError('');
    try {
      await cloud.api.updateLearningResource(institution, record.id, {
        title: record.title,
        description: record.description,
        category: record.category,
        audience: record.audience,
        url: record.hasFile ? '' : record.url,
        classIds: record.classIds || [],
        programme: record.programme,
        stage: record.stage,
        levelNumber: record.levelNumber ?? undefined,
        studentMessage: record.studentMessage,
        objective: record.objective,
        duration: record.duration,
        expectedOutcome: record.expectedOutcome,
        versionLabel: record.versionLabel,
        status,
        expectedVersion: record.version,
        ...((record as any).mediaKey
          ? {
              mediaKey: (record as any).mediaKey,
              fileName: record.fileName,
              mimeType: record.mimeType,
              fileSize: record.fileSize,
            }
          : {}),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update this resource.');
    }
  };
  const remove = async (record: Resource) => {
    if (!window.confirm(`Delete “${record.title}”?`)) return;
    setError('');
    try {
      await cloud.api.deleteLearningResource(institution, record.id, record.version);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete this resource.');
    }
  };

  const visibleGroups =
    activeTab === 'syllabus'
      ? groups.filter((group) => group.id === 'syllabus')
      : groups.filter((group) => group.id !== 'syllabus');
  const visibleRecords = records
    .filter((record) =>
      activeTab === 'syllabus' ? record.category === 'syllabus' : record.category !== 'syllabus',
    )
    .sort((a, b) =>
      activeTab === 'syllabus'
        ? a.programme.localeCompare(b.programme) ||
          (a.levelNumber ?? 999) - (b.levelNumber ?? 999) ||
          a.title.localeCompare(b.title)
        : a.title.localeCompare(b.title),
    );
  const canAdd = activeTab === 'syllabus' ? canEditSyllabus : canManageResources;
  const toggleClass = (id: string) =>
    setForm((current) =>
      current
        ? {
            ...current,
            classIds: current.classIds.includes(id)
              ? current.classIds.filter((x) => x !== id)
              : [...current.classIds, id],
          }
        : current,
    );

  return (
    <section className="syllabus-library" aria-label="Syllabus and resources">
      {showHeading && (
        <header className="syllabus-library-heading">
          <span>
            {institution === 'raaga' ? 'RAAGASUDHA' : 'ŚRUTI VEDAM'} ·{' '}
            {admin ? 'ADMINISTRATOR' : canManageResources ? 'TEACHER' : 'LEARNING RESOURCES'}
          </span>
          <h1>Syllabus &amp; Resources</h1>
          <p>Academy syllabus and class learning materials.</p>
        </header>
      )}
      <nav className="syllabus-library-tabs" role="tablist" aria-label="Syllabus sections">
        <button
          type="button"
          role="tab"
          id="syllabus-tab"
          aria-controls="syllabus-library-panel"
          aria-selected={activeTab === 'syllabus'}
          className={activeTab === 'syllabus' ? 'active' : ''}
          onClick={() => setActiveTab('syllabus')}
        >
          Syllabus
        </button>
        <button
          type="button"
          role="tab"
          id="resources-tab"
          aria-controls="syllabus-library-panel"
          aria-selected={activeTab === 'resources'}
          className={activeTab === 'resources' ? 'active' : ''}
          onClick={() => setActiveTab('resources')}
        >
          Resources
        </button>
      </nav>
      <div
        className="syllabus-library-panel"
        id="syllabus-library-panel"
        role="tabpanel"
        aria-labelledby={activeTab === 'syllabus' ? 'syllabus-tab' : 'resources-tab'}
      >
        <div className="syllabus-library-toolbar">
          <div>
            <h2>{activeTab === 'syllabus' ? 'Curriculum' : 'Learning resources'}</h2>
            <p>
              {activeTab === 'syllabus'
                ? 'Published curriculum for this academy.'
                : 'Materials shared with selected classes.'}
            </p>
          </div>
          <div className="syllabus-library-actions">
            {(canEditSyllabus || canManageResources) && (
              <button
                type="button"
                className="syllabus-secondary"
                onClick={() => void refresh()}
                disabled={busy}
              >
                <RefreshCw size={16} /> Refresh
              </button>
            )}
            {canAdd && (
              <button type="button" className="syllabus-primary" onClick={openNew}>
                <Plus size={17} /> Add {activeTab === 'syllabus' ? 'syllabus' : 'resource'}
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="syllabus-error" role="alert">
            {error}
          </p>
        )}
        {busy ? (
          <p className="syllabus-empty" role="status">
            Loading resources…
          </p>
        ) : (
          <>
            {visibleGroups.map((group) => {
              const items = visibleRecords.filter(
                (record) =>
                  record.category === group.id &&
                  (admin ||
                    record.status === 'published' ||
                    (canManageResources && record.classIds?.length)),
              );
              if (!items.length && !(group.id === 'syllabus' && !admin && journeyStages.length))
                return null;
              if (group.id === 'syllabus') {
                const programmes = new Map<string, Resource[]>();
                for (const record of items) {
                  const programme = record.programme || 'Curriculum';
                  programmes.set(programme, [...(programmes.get(programme) || []), record]);
                }
                if (!admin)
                  for (const item of journeyStages) {
                    if (!programmes.has(item.programme)) programmes.set(item.programme, []);
                  }
                return (
                  <div className="syllabus-programmes" key={group.id}>
                    {Array.from(programmes.entries()).map(
                      ([programme, programmeItems], programmeIndex) => {
                        const stageMap = new Map<
                          string,
                          { metadata: JourneyStage[]; items: Resource[] }
                        >();
                        const metadata: JourneyStage[] = admin
                          ? programmeItems
                              .filter((record) => record.status !== 'archived')
                              .map((record) => ({
                                programme,
                                stage: record.stage || 'Stages',
                                levelNumber: record.levelNumber,
                                published: record.status === 'published',
                              }))
                          : journeyStages.filter((item) => item.programme === programme);
                        for (const item of metadata) {
                          const entry = stageMap.get(item.stage) || { metadata: [], items: [] };
                          entry.metadata.push(item);
                          stageMap.set(item.stage, entry);
                        }
                        for (const record of programmeItems) {
                          const stage = record.stage || 'Stages';
                          const entry = stageMap.get(stage) || { metadata: [], items: [] };
                          entry.items.push(record);
                          stageMap.set(stage, entry);
                        }
                        const stageEntries = Array.from(stageMap.entries()).sort(
                          ([, a], [, b]) =>
                            Math.min(...a.metadata.map((item) => item.levelNumber ?? 999), 999) -
                            Math.min(...b.metadata.map((item) => item.levelNumber ?? 999), 999),
                        );
                        return (
                          <section className="syllabus-programme" key={programme}>
                            <header className="syllabus-programme-heading">
                              <div>
                                <span>LEARNING JOURNEY</span>
                                <h3>{programme}</h3>
                              </div>
                              <span className="syllabus-group-count">
                                {stageEntries.length}{' '}
                                {stageEntries.length === 1 ? 'stage' : 'stages'}
                              </span>
                            </header>
                            <nav
                              className="syllabus-stage-timeline"
                              aria-label={`${programme} stages`}
                            >
                              {stageEntries.map(([stage, entry], stageIndex) => {
                                const numbers = entry.metadata
                                  .map((item) => item.levelNumber)
                                  .filter((level): level is number => level != null);
                                const range = numbers.length
                                  ? numbers.length === 1
                                    ? `Level ${numbers[0]}`
                                    : `Levels ${Math.min(...numbers)}–${Math.max(...numbers)}`
                                  : `${entry.items.length} ${entry.items.length === 1 ? 'level' : 'levels'}`;
                                const current = entry.metadata.some((item) =>
                                  isPravesha(stage, item.levelNumber),
                                );
                                const available =
                                  admin ||
                                  (current && entry.metadata.some((item) => item.published));
                                const StageTag = available ? 'a' : 'span';
                                return (
                                  <StageTag
                                    key={stage}
                                    className={
                                      admin ? '' : current ? 'is-current' : 'is-unpublished'
                                    }
                                    {...(available
                                      ? { href: `#syllabus-stage-${programmeIndex}-${stageIndex}` }
                                      : { 'aria-label': `${stage}, not available yet` })}
                                  >
                                    <span className="syllabus-timeline-dot" aria-hidden="true" />
                                    <strong>{stage}</strong>
                                    <small>{range}</small>
                                  </StageTag>
                                );
                              })}
                            </nav>
                            <div className="syllabus-journey">
                              {stageEntries
                                .filter(([stage, entry]) =>
                                  entry.items.some(
                                    (record) => admin || isPravesha(stage, record.levelNumber),
                                  ),
                                )
                                .map(([stage, entry], stageIndex) => (
                                  <section
                                    className="syllabus-stage-section"
                                    id={`syllabus-stage-${programmeIndex}-${stageIndex}`}
                                    key={stage}
                                  >
                                    <h4>{stage}</h4>
                                    <div className="syllabus-stage-items">
                                      {entry.items
                                        .filter(
                                          (record) =>
                                            admin || isPravesha(stage, record.levelNumber),
                                        )
                                        .map((record) => (
                                          <article className="syllabus-stage-item" key={record.id}>
                                            <div
                                              className="syllabus-stage-marker"
                                              aria-hidden="true"
                                            >
                                              <FileText size={17} />
                                            </div>
                                            <div className="syllabus-stage-content">
                                              <div className="syllabus-stage-topline">
                                                <div className="syllabus-stage-badges">
                                                  {record.levelNumber != null && (
                                                    <span className="syllabus-level-pill">
                                                      Level {record.levelNumber}
                                                    </span>
                                                  )}
                                                  <span
                                                    className={`syllabus-status is-${record.status}`}
                                                  >
                                                    {statusLabel[record.status]}
                                                  </span>
                                                </div>
                                                {record.canManage && (
                                                  <div className="syllabus-stage-card-actions">
                                                    <button
                                                      type="button"
                                                      className="syllabus-stage-edit"
                                                      onClick={() => openEdit(record)}
                                                      aria-label={`Edit ${record.title}`}
                                                    >
                                                      <Pencil size={15} />
                                                    </button>
                                                    {record.status === 'draft' && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void changeStatus(record, 'published')
                                                        }
                                                      >
                                                        Publish
                                                      </button>
                                                    )}
                                                    {record.status === 'published' && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void changeStatus(record, 'archived')
                                                        }
                                                        aria-label={`Archive ${record.title}`}
                                                      >
                                                        <Archive size={15} />
                                                      </button>
                                                    )}
                                                    {record.status === 'archived' && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void changeStatus(record, 'published')
                                                        }
                                                      >
                                                        Republish
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      className="syllabus-delete"
                                                      onClick={() => void remove(record)}
                                                      aria-label={`Delete ${record.title}`}
                                                    >
                                                      <Trash2 size={15} />
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                              <div className="syllabus-stage-grid">
                                                <div className="syllabus-stage-summary">
                                                  <h5>{record.title}</h5>
                                                  <p className="syllabus-student-message">
                                                    {record.studentMessage || '—'}
                                                  </p>
                                                  <div className="syllabus-stage-meta">
                                                    {record.duration && (
                                                      <span>{record.duration}</span>
                                                    )}
                                                    {record.versionLabel && (
                                                      <span>{record.versionLabel}</span>
                                                    )}
                                                  </div>
                                                </div>
                                                {(record.objective ||
                                                  record.description ||
                                                  record.expectedOutcome) && (
                                                  <div className="syllabus-stage-learning">
                                                    {record.objective && (
                                                      <div>
                                                        <strong>Objective</strong>
                                                        <p>{record.objective}</p>
                                                      </div>
                                                    )}
                                                    {record.description && (
                                                      <div>
                                                        <strong>Learning content</strong>
                                                        <p>{record.description}</p>
                                                      </div>
                                                    )}
                                                    {record.expectedOutcome && (
                                                      <div>
                                                        <strong>Expected outcome</strong>
                                                        <p>{record.expectedOutcome}</p>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                              {(record.hasFile || record.url) && (
                                                <div className="syllabus-card-actions">
                                                  <a
                                                    href={record.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                  >
                                                    {record.hasFile
                                                      ? 'Download file'
                                                      : 'Open resource'}{' '}
                                                    <ExternalLink size={15} />
                                                  </a>
                                                </div>
                                              )}
                                            </div>
                                          </article>
                                        ))}
                                    </div>
                                  </section>
                                ))}
                            </div>
                          </section>
                        );
                      },
                    )}
                  </div>
                );
              }
              return (
                <section className="syllabus-group" key={group.id}>
                  <h3>
                    {group.label}
                    <span className="syllabus-group-count">{items.length} items</span>
                  </h3>
                  <div className="syllabus-grid">
                    {items.map((record) => (
                      <article className="syllabus-card" key={record.id}>
                        <div className="syllabus-card-icon">
                          <FileText size={20} />
                        </div>
                        <div className="syllabus-card-body">
                          <div className="syllabus-card-title">
                            <h4>{record.title}</h4>
                            <span className={`syllabus-status is-${record.status}`}>
                              {statusLabel[record.status]}
                            </span>
                          </div>
                          {record.description && <p>{record.description}</p>}
                          <div className="syllabus-card-meta">
                            <span>
                              {record.audience === 'all'
                                ? 'Students & families'
                                : record.audience === 'families'
                                  ? 'Families'
                                  : 'Students'}
                            </span>
                            {record.classIds?.length > 0 && (
                              <span>
                                {record.classIds
                                  .map((id) => classNames.get(id) || 'Class')
                                  .join(', ')}
                              </span>
                            )}
                          </div>
                          <div className="syllabus-card-actions">
                            {(record.hasFile || record.url) && (
                              <a href={record.url} target="_blank" rel="noreferrer">
                                {record.hasFile ? 'Download file' : 'Open resource'}{' '}
                                <ExternalLink size={15} />
                              </a>
                            )}
                            {record.canManage && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => openEdit(record)}
                                  aria-label={`Edit ${record.title}`}
                                >
                                  <Pencil size={16} />
                                </button>
                                {record.status === 'draft' && (
                                  <button
                                    type="button"
                                    onClick={() => void changeStatus(record, 'published')}
                                  >
                                    Publish
                                  </button>
                                )}
                                {record.status === 'published' && (
                                  <button
                                    type="button"
                                    onClick={() => void changeStatus(record, 'archived')}
                                    aria-label={`Archive ${record.title}`}
                                  >
                                    <Archive size={16} />
                                  </button>
                                )}
                                {record.status === 'archived' && (
                                  <button
                                    type="button"
                                    onClick={() => void changeStatus(record, 'published')}
                                  >
                                    Republish
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="syllabus-delete"
                                  onClick={() => void remove(record)}
                                  aria-label={`Delete ${record.title}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
            {!visibleRecords.some(
              (record) =>
                admin ||
                record.status === 'published' ||
                (canManageResources && record.classIds?.length),
            ) &&
              !(activeTab === 'syllabus' && !admin && journeyStages.length > 0) && (
                <div className="syllabus-empty">
                  <BookOpen size={24} />
                  <strong>
                    {activeTab === 'syllabus'
                      ? 'No syllabus published yet'
                      : 'No resources shared yet'}
                  </strong>
                  <span>
                    {canAdd
                      ? 'Add content when it is ready.'
                      : 'Published materials will appear here.'}
                  </span>
                  {canAdd && (
                    <button type="button" className="syllabus-primary" onClick={openNew}>
                      <Plus size={16} /> Add {activeTab === 'syllabus' ? 'syllabus' : 'resource'}
                    </button>
                  )}
                </div>
              )}
          </>
        )}
        {form && (
          <div
            className="syllabus-modal-shade"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) setForm(null);
            }}
          >
            <section
              className="syllabus-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="syllabus-form-title"
            >
              <header>
                <div>
                  <span>
                    {editing ? 'UPDATE' : 'NEW'}{' '}
                    {form.category === 'syllabus' ? 'SYLLABUS' : 'RESOURCE'}
                  </span>
                  <h2 id="syllabus-form-title">
                    {editing
                      ? 'Edit content'
                      : form.category === 'syllabus'
                        ? 'Add syllabus'
                        : 'Add resource'}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setForm(null)}
                  disabled={saving}
                >
                  <X size={20} />
                </button>
              </header>
              <form onSubmit={(event) => void save(event)}>
                {form.category === 'syllabus' && (
                  <>
                    <div className="syllabus-form-row syllabus-curriculum-row">
                      <label>
                        Programme
                        <input
                          required
                          maxLength={120}
                          placeholder="e.g. Vedic Chanting"
                          value={form.programme}
                          onChange={(event) => setForm({ ...form, programme: event.target.value })}
                        />
                      </label>
                      <label>
                        Stage
                        <input
                          required
                          maxLength={120}
                          list="syllabus-stage-options"
                          placeholder="e.g. Praveśa, Parinati or Sadhana"
                          value={form.stage}
                          onChange={(event) => setForm({ ...form, stage: event.target.value })}
                        />
                        <datalist id="syllabus-stage-options">
                          <option value="Praveśa" />
                          <option value="Parinati" />
                          <option value="Sadhana" />
                        </datalist>
                      </label>
                    </div>
                    <label>
                      Sequence number
                      <input
                        required
                        type="number"
                        min="0"
                        max="999"
                        step="1"
                        placeholder="e.g. 0"
                        value={form.levelNumber}
                        onChange={(event) => setForm({ ...form, levelNumber: event.target.value })}
                      />
                      <span>Use 0 for Praveśa; Parinati 1–24; Sadhana 25–36.</span>
                    </label>
                  </>
                )}
                <label>
                  Title
                  <input
                    required
                    maxLength={120}
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                  />
                </label>
                {form.category === 'syllabus' ? (
                  <>
                    <label>
                      Student message <span>Optional</span>
                      <input
                        maxLength={300}
                        placeholder="e.g. I discover Śruti."
                        value={form.studentMessage}
                        onChange={(event) =>
                          setForm({ ...form, studentMessage: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Objective <span>Optional</span>
                      <textarea
                        maxLength={1200}
                        rows={2}
                        placeholder="What should the student gain from this stage?"
                        value={form.objective}
                        onChange={(event) => setForm({ ...form, objective: event.target.value })}
                      />
                    </label>
                    <label>
                      Duration <span>Optional</span>
                      <input
                        maxLength={80}
                        placeholder="e.g. 3–6 months"
                        value={form.duration}
                        onChange={(event) => setForm({ ...form, duration: event.target.value })}
                      />
                    </label>
                    <label>
                      Content <span>Optional</span>
                      <textarea
                        maxLength={1200}
                        rows={4}
                        placeholder="Topics, chants and learning focus"
                        value={form.description}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                      />
                    </label>
                    <label>
                      Expected outcome <span>Optional</span>
                      <textarea
                        maxLength={1200}
                        rows={3}
                        placeholder="What should the student be able to do?"
                        value={form.expectedOutcome}
                        onChange={(event) =>
                          setForm({ ...form, expectedOutcome: event.target.value })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Description <span>Optional</span>
                    <textarea
                      maxLength={1200}
                      rows={3}
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                    />
                  </label>
                )}
                {form.category !== 'syllabus' && (
                  <div className="syllabus-form-row">
                    <label>
                      Category
                      <select
                        value={form.category}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            category: event.target.value as Category,
                            classIds: event.target.value === 'syllabus' ? [] : form.classIds,
                          })
                        }
                      >
                        {groups
                          .filter((group) => group.id !== 'syllabus')
                          .map((group) => (
                            <option value={group.id} key={group.id}>
                              {group.label}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Audience
                      <select
                        value={form.audience}
                        onChange={(event) =>
                          setForm({ ...form, audience: event.target.value as Audience })
                        }
                      >
                        <option value="all">Students &amp; families</option>
                        <option value="students">Students</option>
                        <option value="families">Families</option>
                      </select>
                    </label>
                  </div>
                )}
                {form.category !== 'syllabus' && (
                  <fieldset className="syllabus-class-picker">
                    <legend>Share with classes</legend>
                    <p>Select one or more classes.</p>
                    {classes.length ? (
                      <div>
                        {classes.map((item) => (
                          <label key={item.classId}>
                            <input
                              type="checkbox"
                              checked={form.classIds.includes(item.classId)}
                              onChange={() => toggleClass(item.classId)}
                            />
                            <span>{item.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span>No active classes are available.</span>
                    )}
                  </fieldset>
                )}
                <label>
                  Resource link <span>Optional when uploading a file</span>
                  <input
                    type="url"
                    pattern="https://.*"
                    placeholder="https://…"
                    value={form.url}
                    onChange={(event) => setForm({ ...form, url: event.target.value })}
                  />
                </label>
                <label className="syllabus-file-input">
                  <span>
                    <UploadCloud size={17} /> Upload a file{' '}
                    <small>PDF, Office documents, images, audio or video · up to 100 MB</small>
                  </span>
                  <input
                    type="file"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                  {file && (
                    <small>
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </small>
                  )}
                  {editing?.hasFile && !file && <small>Current file: {editing.fileName}</small>}
                </label>
                <div className="syllabus-form-row">
                  <label>
                    Version label <span>Optional</span>
                    <input
                      maxLength={50}
                      placeholder="e.g. 2026–27"
                      value={form.versionLabel}
                      onChange={(event) => setForm({ ...form, versionLabel: event.target.value })}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm({ ...form, status: event.target.value as Status })
                      }
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>
                {error && (
                  <p className="syllabus-error" role="alert">
                    {error}
                  </p>
                )}
                <footer>
                  <button
                    type="button"
                    className="syllabus-secondary"
                    onClick={() => setForm(null)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="syllabus-primary"
                    disabled={
                      saving ||
                      (form.category !== 'syllabus' &&
                        !form.url.trim() &&
                        !file &&
                        !editing?.hasFile) ||
                      (form.category === 'syllabus' &&
                        (!form.programme.trim() ||
                          !form.stage.trim() ||
                          form.levelNumber === '' ||
                          !Number.isInteger(Number(form.levelNumber)) ||
                          Number(form.levelNumber) < 0 ||
                          Number(form.levelNumber) > 999 ||
                          (!form.description.trim() &&
                            !form.objective.trim() &&
                            !form.expectedOutcome.trim() &&
                            !form.studentMessage.trim() &&
                            !form.url.trim() &&
                            !file &&
                            !editing?.hasFile))) ||
                      (form.category !== 'syllabus' && !form.classIds.length)
                    }
                  >
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Save content'}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
