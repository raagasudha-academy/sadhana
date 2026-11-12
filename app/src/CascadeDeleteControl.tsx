import { useEffect, useRef, useState } from 'react';
import type { InstitutionId } from './types';
import './websiteRegistrations.css';
export type CascadeTarget = { type: string; id: string; name: string; version: number };
export type CascadePreview = {
  targetType: string;
  targetId: string;
  expectedVersion: number;
  signature: string;
  counts: Array<{ label: string; count: number }>;
  total: number;
  retained?: Array<{ label: string; count: number }> | string[];
  notice?: string;
  executionReason?: string;
  executionBlocked?: boolean;
  executionEnabled?: boolean;
};
export type CascadeApi = {
  previewCascadeDelete: (
    institution: InstitutionId,
    target: CascadeTarget,
  ) => Promise<CascadePreview>;
  executeCascadeDelete: (
    institution: InstitutionId,
    target: CascadeTarget,
    signature: string,
  ) => Promise<{ deleted: boolean }>;
};
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim()
    ? error.message.trim().replace(/[.\s]+$/, '')
    : fallback;
export default function CascadeDeleteControl({
  allowed,
  api,
  institution,
  target,
  onDeleted,
  inline = false,
  onBusyChange,
}: {
  allowed: boolean;
  api: CascadeApi;
  institution: InstitutionId;
  target: CascadeTarget;
  onDeleted: () => void | Promise<void>;
  inline?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState<CascadePreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [word, setWord] = useState('');
  const generation = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    setOpen(false);
    setPreview(null);
    setWord('');
    setError('');
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [target.id, target.type, target.version, institution, allowed]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  if (!allowed) return null;
  async function review() {
    if (inFlight.current) return;
    inFlight.current = true;
    const ticket = generation.current;
    setOpen(true);
    setBusy(true);
    setError('');
    setPreview(null);
    setWord('');
    try {
      const result = await api.previewCascadeDelete(institution, target);
      if (ticket !== generation.current) return;
      if (
        result.targetId !== target.id ||
        result.targetType !== target.type ||
        result.expectedVersion !== target.version ||
        !result.signature ||
        !Number.isSafeInteger(result.total) ||
        result.total < 1 ||
        !Array.isArray(result.counts) ||
        result.counts.some(
          (row) => !row.label || !Number.isSafeInteger(row.count) || row.count < 0,
        ) ||
        result.counts.reduce((sum, row) => sum + row.count, 0) !== result.total
      )
        throw Error('The deletion preview is incomplete. Please retry.');
      setPreview(result);
    } catch (e) {
      if (ticket === generation.current)
        setError(`${errorText(e, 'Deletion preview is unavailable.')}. No records were deleted.`);
    } finally {
      inFlight.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function remove() {
    if (
      inFlight.current ||
      !preview ||
      preview.executionBlocked ||
      preview.executionEnabled !== true ||
      word !== 'DELETE'
    )
      return;
    inFlight.current = true;
    const ticket = generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await api.executeCascadeDelete(institution, target, preview.signature);
      if (ticket !== generation.current) return;
      if (result.deleted !== true) throw Error('Deletion was not confirmed.');
      setOpen(false);
      setPreview(null);
      setWord('');
      try {
        await onDeleted();
      } catch {
        setOpen(true);
        setError('Deleted successfully. Refresh the page to update the list.');
      }
    } catch (e) {
      if (ticket === generation.current) {
        setPreview(null);
        setWord('');
        setError(
          `${errorText(e, 'Deletion was not confirmed.')}. Refresh the record before trying again.`,
        );
      }
    } finally {
      inFlight.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="reg-danger" disabled={busy} onClick={() => void review()}>
        Review deletion
      </button>
      {open && (
        <div className={inline ? undefined : 'wr-modal-backdrop'}>
          <section
            className={inline ? undefined : 'wr-modal'}
            role={inline ? 'region' : 'alertdialog'}
            aria-modal={inline ? undefined : true}
            aria-label={`Delete ${target.name} permanently`}
          >
            <h2>Review deletion: {target.name}</h2>
            <p>
              Review the affected records before any permanent deletion. Nothing is deleted when you
              open this preview. On confirmation, the listed academy records are removed;
              registration history and roll-number reservations are retained.
            </p>
            {busy && <p role="status">{preview ? 'Deleting…' : 'Checking linked records…'}</p>}
            {error && <p role="alert">{error}</p>}
            {preview && (
              <div className="cascade-review" aria-live="polite">
                <div className="cascade-review-total">
                  <strong>{preview.total}</strong>
                  <span>records in proposed deletion</span>
                </div>
                <div className="cascade-review-list" aria-label="Proposed deletion breakdown">
                  {preview.counts
                    .filter((row) => row.count > 0)
                    .map((row) => (
                      <div className="cascade-review-row" key={row.label}>
                        <span>
                          {row.label.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <strong>{row.count}</strong>
                      </div>
                    ))}
                </div>
                {preview.notice && <p className="cascade-review-notice">{preview.notice}</p>}
                {!!preview.retained?.length && (
                  <div className="cascade-review-retained">
                    {preview.retained.map((item, index) => (
                      <p key={typeof item === 'string' ? item : `${item.label}-${index}`}>
                        {typeof item === 'string' ? item : `${item.label} (${item.count})`}
                      </p>
                    ))}
                  </div>
                )}
                {preview.executionBlocked || preview.executionEnabled !== true ? (
                  <p className="cascade-review-blocked" role="status">
                    <strong>Preview only.</strong>{' '}
                    {preview.executionReason ||
                      'Permanent deletion is not enabled for this record.'}{' '}
                    No data has been deleted.
                  </p>
                ) : (
                  <label className="password-field">
                    Type DELETE to confirm permanent removal
                    <input
                      autoFocus
                      value={word}
                      disabled={busy}
                      onChange={(e) => setWord(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                )}
              </div>
            )}
            <div className="wr-modal-actions">
              <button
                type="button"
                className="wr-modal-cancel"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setPreview(null);
                  setWord('');
                }}
              >
                Cancel
              </button>
              {!preview && error && (
                <button type="button" disabled={busy} onClick={() => void review()}>
                  Refresh preview
                </button>
              )}
              <button
                type="button"
                className="wr-modal-discard"
                disabled={
                  busy ||
                  !preview ||
                  preview.executionBlocked ||
                  preview.executionEnabled !== true ||
                  word !== 'DELETE'
                }
                onClick={() => void remove()}
              >
                Delete permanently
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
