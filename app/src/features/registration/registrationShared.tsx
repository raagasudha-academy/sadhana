import {UsersRound, X} from 'lucide-react';

export const clean = (s) =>
  String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
// Public identifiers are immutable DynamoDB attributes; UUIDs remain internal keys.
export const familyLabel = (family: any) => family?.familyNumber || 'Pending family number';
export const readableLocation = (value: unknown) => {
  const raw = String(value || '').trim().replace(/^LOC-/i, '').replace(/_/g, ' ');
  return raw && raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b[a-z]/g, x => x.toUpperCase()) : raw;
};
export const studentLabel = (student: any) => student?.rollNumber || 'Pending roll number';
export function Status({ status }: any) {
  return <span className={`reg-status reg-${status.toLowerCase()}`}>{status}</span>;
}
export function Modal({ title, subtitle, onClose, children }: any) {
  return (
    <div
      className="reg-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="reg-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="reg-modal-head">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="reg-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Field({ label, hint, children }: any) {
  return (
    <label className="reg-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function StudentAvatar({ name }: any) {
  return (
    <span className="reg-avatar">
      {clean(name)
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()}
    </span>
  );
}
export function NoResults({ title, detail }: any) {
  return (
    <div className="reg-empty">
      <UsersRound size={29} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
export const relationshipLabel = (student: any) =>
  !student?.familyId
    ? 'Independent Student'
    : student?.relationship === 'parent_guardian'
      ? 'Parent / Guardian + Student'
      : student?.relationship === 'other'
        ? 'Other Family Member + Student'
        : student?.relationship === 'adult_student'
        ? 'Adult + Student'
        : 'Child + Student';
export const fmtDate = (value) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T12:00:00Z`))
    : '—';

