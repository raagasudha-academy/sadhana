import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import './teacherAdministrators.css';

type Administrator = {
  peerId: string;
  peerName: string;
  photoUrl?: string;
};

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
      const result = await cloud.api.listMessageContacts(institution);
      setRecords(
        result.records
          .filter((record) => record.peerRole === 'admin')
          .map(({ peerId, peerName, photoUrl }) => ({ peerId, peerName, photoUrl })),
      );
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
          <p className="teacher-administrators-eyebrow">ACADEMY DIRECTORY</p>
          <h1 id="teacher-administrators-title">Administrators</h1>
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
        <div className="teacher-administrators-grid">
          {records.map((admin) => (
            <article key={admin.peerId}>
              <span className="teacher-administrators-avatar" aria-hidden="true">
                <span>{admin.peerName.trim().slice(0, 1).toUpperCase() || 'A'}</span>
                {admin.photoUrl && (
                  <img
                    src={admin.photoUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </span>
              <div>
                <h2>{admin.peerName}</h2>
                <span>
                  <ShieldCheck size={14} /> Administrator
                </span>
              </div>
            </article>
          ))}
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
