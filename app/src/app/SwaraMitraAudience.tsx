import { useEffect, useState } from 'react';
import type { CloudSession } from '../CloudAuth';
import type { InstitutionId } from '../types';

type AudienceRecord = {
  studentId: string;
  displayName?: string;
  whatsappAllowed: boolean;
};

/** A truthful preview of the class audience while outbound delivery is not available. */
export function SwaraMitraAudience({
  cloud,
  institution,
  classId,
}: {
  cloud: CloudSession | null;
  institution: InstitutionId | 'shared';
  classId?: string;
}) {
  const [records, setRecords] = useState<AudienceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cloud || !classId || (institution !== 'raaga' && institution !== 'sruti')) {
      setRecords([]);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    setRecords([]);
    setError('');
    cloud.api
      .listSwaraMitraPreferences(institution, classId)
      .then(({ records: next }) => {
        if (active) setRecords(next);
      })
      .catch((e: Error) => {
        if (active) setError(e.message || 'Could not load the class notification audience.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cloud?.api, institution, classId]);

  const allowed = records.filter((record) => record.whatsappAllowed);
  const inAppOnly = records.filter((record) => !record.whatsappAllowed);

  return (
    <section className="swaramitra-audience" aria-label="SwaraMitra notification audience">
      <label className="swaramitra-audience__choice">
        <input type="checkbox" disabled aria-describedby="swaramitra-delivery-status" />
        <span>Also send a WhatsApp update</span>
        <small>Not connected yet</small>
      </label>
      <p id="swaramitra-delivery-status" className="swaramitra-audience__status">
        {loading
          ? 'Loading this class’s notification choices…'
          : error
            ? `Audience preview unavailable: ${error}`
            : `${allowed.length} allowed for WhatsApp · ${inAppOnly.length} in-app only`}
      </p>
      {!loading && !error && records.length > 0 && (
        <details>
          <summary>View students</summary>
          <ul>
            {records.map((record) => (
              <li
                className={record.whatsappAllowed ? 'is-whatsapp-allowed' : 'is-in-app-only'}
                key={record.studentId}
              >
                <span>{record.displayName || 'Student'}</span>
                <span>{record.whatsappAllowed ? 'WhatsApp allowed' : 'No WhatsApp · in-app only'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!loading && !error && records.length === 0 && (
        <p className="swaramitra-audience__status">No active students are enrolled in this class.</p>
      )}
      <p className="swaramitra-audience__note">
        Class changes still create Sadhana in-app notices for enrolled students. WhatsApp delivery
        will be enabled here once SwaraMitra’s outbound service is connected.
      </p>
    </section>
  );
}
