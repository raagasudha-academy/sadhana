import { useEffect, useState } from 'react';
import { Plus, UserRound, X, Pencil, Archive, RotateCcw } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { TeacherRecord } from './api/sadhanaClient';
import type { InstitutionId } from './types';
import { institutions } from './institutions';
import PhotoAvatarEditor from './PhotoAvatarEditor';
import {NAME_TITLES,splitTitledName,titledName,type NameTitle} from './nameTitles';


const teacherPortraitFiles: Record<string, string> = {
  'mrs praveena srikailash': 'praveena-srikailash.png',
  'mrs amruta hasa': 'amruta-hasa.png',
  'dr aishwarya amarnath': 'aishwarya-amarnath.png',
  'dr uma geethanath': 'uma-geethanath.png',
  'mr srikailash venkitadri': 'srikailash-venkitadri.png',
  'mr vibhas chengalavala': 'vibhas-chengalavala.png',
  'ms swathi komaraolu': 'swathi-komaraolu.png',
  'mohana kamanooru': 'mohana-kamanooru.png',
};

function TeacherPortrait({name,photoUrl=''}:{name:string;photoUrl?:string}) {
  const key=name.trim().toLowerCase().replace(/\s+/g,' ');
  const filename=teacherPortraitFiles[key];
  const fallback=filename?`${import.meta.env.BASE_URL}teachers/${filename}`:'';
  const [source,setSource]=useState(photoUrl||fallback);
  useEffect(()=>setSource(photoUrl||fallback),[photoUrl,fallback]);
  return <span className="teacher-portrait">
    {source?<img src={source} alt="" loading="lazy"
      onError={()=>setSource(source===photoUrl?fallback:'')}/>:<UserRound size={24}/>}
  </span>;
}

const initialForm = (institution: InstitutionId) => ({
  displayName: '',
  title: '' as NameTitle,
  institutions: [institution] as InstitutionId[],
  subjects: ['Vedic Chanting'],
  aliases: [] as string[],
  cognitoSub: '',
  active: true,
});

type TeacherForm = ReturnType<typeof initialForm>;

export default function TeacherManagement({
  cloud, workspace
}: {
  cloud?: CloudSession;
  workspace: string;
}) {
  const allowed = cloud?.staff.institutions || [];
  const scopedInstitutions: InstitutionId[] =
    workspace === 'raaga' || workspace === 'sruti'
      ? (allowed.includes(workspace) ? [workspace] : [])
      : allowed.filter(i => i === 'raaga' || i === 'sruti');

  const defaultInstitution: InstitutionId =
    scopedInstitutions[0] || allowed[0] || 'sruti';

  const scopedInstitutionsKey =
    [...scopedInstitutions].sort().join(',');

  const apiInstitution = (selected: InstitutionId[]): InstitutionId =>
    selected.find(i => allowed.includes(i)) || defaultInstitution;

  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [editing, setEditing] =
    useState<TeacherRecord | null | undefined>();
  const [form, setForm] =
    useState<TeacherForm>(() => initialForm(defaultInstitution));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [editingPhotoUrl, setEditingPhotoUrl] = useState('');

  const isAdmin = cloud?.staff.role === 'admin';

  useEffect(() => {
    let active = true;
    setError('');

    if (!cloud || !scopedInstitutionsKey) {
      setTeachers([]);
      return () => { active = false; };
    }

    const api = cloud.api;
    const scope =
      scopedInstitutionsKey.split(',') as InstitutionId[];

    Promise.all(scope.map(inst => api.listTeachers(inst)))
      .then(results => {
        if (!active) return;

        const unique = new Map<string, TeacherRecord>();

        for (const result of results) {
          for (const teacher of result.records) {
            const previous = unique.get(teacher.id);

            if (!previous ||
                (!previous.cognitoSub && !!teacher.cognitoSub)) {
              unique.set(teacher.id, teacher);
            }
          }
        }

        setTeachers([...unique.values()].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)));
      })
      .catch(e => {
        if (active) setError(
          e instanceof Error ? e.message : 'Unable to load teachers.'
        );
      });

    return () => { active = false; };
  }, [cloud?.api, scopedInstitutionsKey, revision]);
  const setTeacherArchived = async (
    teacher: TeacherRecord,
    archive: boolean
  ) => {
    if (!cloud || cloud.staff.role !== 'admin' || archiveBusyId)
      return;

    const institution = teacher.institutions.find(
      i => allowed.includes(i)
    );

    if (!institution) {
      setError('No access to this institution.');
      return;
    }

    if (archive && !window.confirm(
      `Archive ${teacher.displayName}? Historical records will remain.`
    )) return;

    setArchiveBusyId(teacher.id);
    setError('');

    try {
      await cloud.api.updateTeacher(institution, teacher.id, {
        displayName: teacher.displayName,
        institutions: teacher.institutions,
        subjects: teacher.subjects,
        aliases: teacher.aliases,
        cognitoSub: teacher.cognitoSub || '',
        active: !archive
      }, teacher.version);

      setRevision(v => v + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to update teacher.'
      );
    } finally {
      setArchiveBusyId(null);
    }
  };

  const openForm = (teacher?: TeacherRecord) => {
    setEditing(teacher || null);
    setEditingPhotoUrl(teacher?.photoUrl || '');
    setForm(teacher ? {
      displayName: splitTitledName(teacher.displayName).name,
      title: splitTitledName(teacher.displayName).title,
      institutions: teacher.institutions,
      subjects: teacher.subjects,
      aliases: teacher.aliases,
      cognitoSub: teacher.cognitoSub || '',
      active: teacher.active,
    } : initialForm(defaultInstitution));
    setError('');
    setMessage('');
  };

  const save = async () => {
    if (!cloud || !isAdmin || saving) return;
    setSaving(true);
    setError('');

    try {
      const {title:_title,...fields}=form;
      const data = {
        ...fields,
        displayName: titledName(form.title,form.displayName),
        cognitoSub: form.cognitoSub.trim(),
        subjects: form.subjects.map(x => x.trim()).filter(Boolean),
        aliases: form.aliases.map(x => x.trim()).filter(Boolean),
      };

      if (!data.displayName || !data.subjects.length ||
          !data.institutions.length)
        throw Error('Name, subject and institution are required.');

      if (editing) {
        await cloud.api.updateTeacher(apiInstitution(editing.institutions), editing.id, data, editing.version
        );
      } else {
        await cloud.api.createTeacher(apiInstitution(form.institutions), data);
      }

      setEditing(undefined);
      setRevision(n => n + 1);
      setMessage(editing
        ? 'Teacher profile updated.'
        : 'Teacher registered successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">ACADEMY MANAGEMENT</div>
        <h1>Teachers</h1>
        <p>Manage registered teachers and their academy assignments.</p>
      </div>
      <div className="teacher-page-actions">
<button type="button" className="reg-secondary"
        onClick={() => setShowArchived(v => !v)}>
        {showArchived ? 'Show Active' : 'Show Archived'}
      </button>
{isAdmin && <button
        className="reg-primary"
        onClick={() => openForm()}
      ><Plus size={16}/> Register Teacher</button>}
</div>
    </div>


    {message && <p className="reg-success" role="status">{message}</p>}
    {error && editing === undefined &&
      <p className="sadhana-sync-error" role="alert">{error}</p>}

    <section className="surface reg-section">
      <div className="reg-section-head">
        <div className="teacher-section-title">
          <h2>Registered Teachers</h2>
          <span className="teacher-section-count">
            {teachers.length} profiles
          </span>
        </div>
      
    
      </div>
      <div className="venue-manage-grid">
        {teachers.filter(t => showArchived ? !t.active : t.active).map(t => <article key={t.id} className="venue-manage-card teacher-card">
          {isAdmin && (
            <div className="teacher-card-actions">
              <button
                type="button"
                className="teacher-card-icon"
                title="Edit teacher"
                aria-label={`Edit ${t.displayName}`}
                onClick={() => openForm(t)}
              >
                <Pencil size={17} />
              </button>
              <button
                type="button"
                className="teacher-card-icon"
                title={t.active ? 'Archive teacher' : 'Restore teacher'}
                aria-label={`${t.active ? 'Archive' : 'Restore'} ${t.displayName}`}
                disabled={archiveBusyId === t.id}
                onClick={() => void setTeacherArchived(t, t.active)}
              >
                {t.active
                  ? <Archive size={17} />
                  : <RotateCcw size={17} />}
              </button>
            </div>
          )}

          <div className="venue-manage-head">
<TeacherPortrait name={t.displayName} photoUrl={t.photoUrl}/>
            <strong>{t.displayName}</strong>
          </div>
          <p>{t.subjects.join(', ')}</p>
          <small>{t.active ? 'Active' : 'Inactive'}</small>
          <p><small>{t.institutions
            .map(i => institutions[i].name).join(' · ')}</small></p>
          {!t.cognitoSub && isAdmin && (
            <p className="teacher-login-note">
              Portal login not linked
            </p>
          )}
          
        
      
</article>)}
      </div>
      {!teachers.length &&
        <p className="reg-footnote">No registered teachers yet.</p>}
    </section>

    {editing !== undefined && <div className="reg-shade">
      <section className="reg-modal" role="dialog"
        aria-modal="true" aria-label="Teacher registration">
        <div className="reg-modal-head">
          <div><h2>{editing ? 'Edit Teacher' : 'Register Teacher'}</h2>
            <p>Teacher information is managed by administrators.</p>
          </div>
          <button className="reg-icon-btn"
            onClick={() => setEditing(undefined)}
            aria-label="Close"><X size={18}/></button>
        </div>

        <form className="reg-form"
          onSubmit={e => { e.preventDefault(); void save(); }}>
          <label className="reg-field"><span>Title</span>
            <select value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value as NameTitle}))}>
              {NAME_TITLES.map(t=><option key={t} value={t}>{t||'No title'}</option>)}
            </select>
          </label>
          <label className="reg-field">
            <span>Full Name (without title)</span>
            <input required maxLength={100}
              value={form.displayName}
              onChange={e => setForm(v => ({
                ...v, displayName: e.target.value
              }))}/>
          </label>

          {editing && <div className="sadhana-teacher-photo-editor">
            {cloud && editing.cognitoSub &&
              editing.institutions.every(i => allowed.includes(i))
              ? <PhotoAvatarEditor api={cloud.api} teacherId={editing.id}
                  label={`${editing.displayName}'s profile photo`}
                  onUploaded={url => {
                    setEditingPhotoUrl(url);
                    setTeachers(rows => rows.map(row => row.id===editing.id
                      ? {...row,photoUrl:url} : row));
                  }}>
                  <TeacherPortrait
                    name={titledName(form.title,form.displayName)}
                    photoUrl={editingPhotoUrl}/>
                </PhotoAvatarEditor>
              : <TeacherPortrait
                  name={titledName(form.title,form.displayName)}
                  photoUrl={editingPhotoUrl}/>}
            <div className="sadhana-teacher-photo-help">
              <strong>Profile photo</strong>
              <span>{editing.cognitoSub
                ? 'Click the portrait to upload or replace the photo. Photo changes save immediately.'
                : 'Link this teacher to a Sadhana login before uploading a photo.'}</span>
            </div>
          </div>}

          <fieldset>
            <legend>Institution</legend>
            {allowed.map(i => <label key={i} style={{marginRight:16}}>
              <input type="checkbox"
                checked={form.institutions.includes(i)}
                onChange={e => setForm(v => ({
                  ...v,
                  institutions: e.target.checked
                    ? [...v.institutions, i]
                    : v.institutions.filter(x => x !== i)
                }))}/>
              {institutions[i].name}
            </label>)}
          </fieldset>

          <fieldset className="reg-field">
            <legend>Teaching Subjects (select all that apply)</legend>
            <div style={{
              display: 'grid',
              gap: 12,
              marginTop: 12
            }}>
              {[
                'Carnatic Music',
                'Vedic Chanting',
                'Vedanta'
              ].map(subject => (
                <label key={subject} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <input
                    type="checkbox"
                    checked={form.subjects.includes(subject)}
                    onChange={e => setForm(v => ({
                      ...v,
                      subjects: e.target.checked
                        ? [...new Set([...v.subjects, subject])]
                        : v.subjects.filter(x => x !== subject)
                    }))}
                  />
                  <span>{subject}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="reg-field">
            <span>Known Name Aliases (comma-separated)</span>
            <input value={form.aliases.join(', ')}
              onChange={e => setForm(v => ({
                ...v,
                aliases: e.target.value.split(',')
                  .map(x => x.trim()).filter(Boolean)
              }))}
              placeholder="Amruta, Amrutha"/>
          </label>

          <label className="reg-field">
            <span>Link to existing Sadhana login (optional)</span>
            <input value={form.cognitoSub}
              onChange={e => setForm(v => ({
                ...v, cognitoSub: e.target.value
              }))}
              placeholder="Verified Cognito sub"/>
            <small>For administrators: use the verified account subject ID. Linking does not change account permissions.</small>
          </label>

          <label className="reg-field">
            <span><input type="checkbox"
              checked={form.active}
              onChange={e => setForm(v => ({
                ...v, active: e.target.checked
              }))}/> Active Teacher</span>
          </label>

          {error && <p className="sadhana-sync-error"
            role="alert">{error}</p>}

          <div className="reg-modal-actions">
            <button type="button" className="reg-secondary"
              onClick={() => setEditing(undefined)}>Cancel</button>
            <button className="reg-primary" type="submit"
              disabled={saving}>
              {saving ? 'Saving…' : 'Save Teacher'}
            </button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
