import { useEffect, useState } from 'react';
import type { CloudSession } from '../CloudAuth';
import type { InstitutionId } from '../types';

type AudienceRecord = {
  studentId: string;
  displayName?: string;
  whatsappAllowed: boolean;
  whatsappReady: boolean;
};

/** A truthful preview of the class audience while outbound delivery is not available. */
export function SwaraMitraAudience({
  cloud,
  institution,
  classId,
  draft,
  suggestedMessage,
  onDraftChange,
}: {
  cloud: CloudSession | null;
  institution: InstitutionId | 'shared';
  classId?: string;
  draft: { enabled: boolean; message: string };
  suggestedMessage: string;
  onDraftChange: (draft: { enabled: boolean; message: string }) => void;
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

  const allowed = records.filter((record) => record.whatsappAllowed && record.whatsappReady);
  const inAppOnly = records.filter((record) => !record.whatsappAllowed || !record.whatsappReady);

  return (
    <section className="swaramitra-audience" aria-label="SwaraMitra notification audience">
      <label className="swaramitra-audience__choice">
        <input
          type="checkbox"
          disabled={loading || !!error || allowed.length === 0}
          checked={draft.enabled}
          aria-describedby="swaramitra-delivery-status"
          onChange={(event) =>
            onDraftChange({
              enabled: event.target.checked,
              message: draft.message || suggestedMessage,
            })
          }
        />
        <span>Also send a WhatsApp update</span>
        <small>Only opted-in students with a usable number will receive WhatsApp.</small>
      </label>
      <p id="swaramitra-delivery-status" className="swaramitra-audience__status">
        {loading
          ? 'Loading this class’s notification choices…'
          : error
            ? `Audience preview unavailable: ${error}`
            : `${allowed.length} eligible for WhatsApp · ${inAppOnly.length} in-app only`}
      </p>
      {draft.enabled && (
        <label className="swaramitra-audience__message">
          Message to send
          <textarea
            value={draft.message || suggestedMessage}
            maxLength={1000}
            rows={3}
            onChange={(event) => onDraftChange({ ...draft, message: event.target.value })}
          />
        </label>
      )}
      {!loading && !error && records.length > 0 && (
        <details>
          <summary>View students</summary>
          <ul>
            {records.map((record) => (
              <li
                className={
                  record.whatsappAllowed && record.whatsappReady
                    ? 'is-whatsapp-allowed'
                    : 'is-in-app-only'
                }
                key={record.studentId}
              >
                <span>{record.displayName || 'Student'}</span>
                <span>
                  {record.whatsappAllowed && record.whatsappReady
                    ? 'WhatsApp allowed'
                    : record.whatsappAllowed
                      ? 'Number unavailable · in-app only'
                      : 'No WhatsApp · in-app only'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!loading && !error && records.length === 0 && (
        <p className="swaramitra-audience__status">
          No active students are enrolled in this class.
        </p>
      )}
    </section>
  );
}
