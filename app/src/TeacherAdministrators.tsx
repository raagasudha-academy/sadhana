import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import { institutions } from './institutions';
import { teacherPortraitFallbackUrl } from './teacherPortraits';
import './teacherAdministrators.css';

type Administrator = {
  displayName: string;
  email: string;
  enabled: boolean;
  status: string;
  photoUrl?: string;
  institution: InstitutionId;
};

function AdminPortrait({ admin }: { admin: Administrator }) {
  const fallback = teacherPortraitFallbackUrl(admin.displayName);
  const [source, setSource] = useState(admin.photoUrl || fallback);
  useEffect(() => setSource(admin.photoUrl || fallback), [admin.photoUrl, fallback]);
  const initials = admin.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
  return (
    <span className="teacher-portrait admin-portrait">
      {source ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setSource(source === admin.photoUrl ? fallback : '')}
        />
      ) : (
        <span aria-hidden="true">{initials || 'A'}</span>
      )}
    </span>
  );
}

export default function TeacherAdministrators({
  cloud,
  institution,
}: {
  cloud: CloudSession;
  institution: InstitutionId;
}) {
  const [records, setRecords] = useState<Administrator[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await cloud.api.listTeacherVisibleAdministrators(institution);
      setRecords(result.records);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load administrators.');
    } finally {
      setBusy(false);
    }
  }, [cloud.api, institution]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="teacher-administrators" aria-labelledby="teacher-administrators-title">
      <header>
        <div>
          <div className="teacher-section-title">
            <h1 id="teacher-administrators-title">Academy Administrators</h1>
            <span className="teacher-section-count">{records.length} profiles</span>
          </div>
          <p>People who manage this academy.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={16} className={busy ? 'sync-spinning' : ''} />
          Refresh
        </button>
      </header>

      {busy ? (
        <p role="status">Loading administrators…</p>
      ) : error ? (
        <p className="teacher-administrators-error" role="alert">
          {error}
        </p>
      ) : records.length ? (
        <div className="venue-manage-grid sadhana-admin-grid">
          {records.map((admin) => {
            return (
              <article
                className="venue-manage-card teacher-card sadhana-admin-card"
                key={`${admin.email}|${admin.institution}`}
              >
                <div className="sadhana-admin-main">
                  <AdminPortrait admin={admin} />
                  <div className="sadhana-admin-details">
                    <strong>{admin.displayName}</strong>
                    {admin.email && <small>{admin.email}</small>}
                    <div className="teacher-b-institutions">
                      <span>{institutions[admin.institution].name}</span>
                    </div>
                  </div>
                </div>
                <div className="sadhana-admin-foot">
                  <span>
                    <ShieldCheck size={15} />
                    {admin.enabled ? 'Account enabled' : 'Account disabled'}
                  </span>
                  <span>{admin.status.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="teacher-administrators-empty">
          No administrators are listed for this academy.
        </p>
      )}
      <p className="teacher-administrators-note">Read-only academy directory.</p>
    </section>
  );
}
