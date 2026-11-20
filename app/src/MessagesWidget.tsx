import { useEffect, useState } from 'react';
import { MessageCircle, Minus, X } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import MessagesPage from './MessagesPage';
import './messagesWidget.css';

export default function MessagesWidget({
  cloud,
  institutions: allowed,
  defaultInstitution,
  studentId,
  studentChoices = [],
  canChooseInstitution = false,
}: {
  cloud: CloudSession;
  institutions: InstitutionId[];
  defaultInstitution?: InstitutionId;
  studentId?: string;
  studentChoices?: Array<{ institution: InstitutionId; id: string; name: string }>;
  canChooseInstitution?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState(studentId || '');
  const [institution, setInstitution] = useState<InstitutionId>(
    defaultInstitution && allowed.includes(defaultInstitution)
      ? defaultInstitution
      : allowed[0] || 'sruti',
  );
  const allowedKey = allowed.join('|');
  useEffect(() => {
    if (allowed.length)
      setInstitution(
        defaultInstitution && allowed.includes(defaultInstitution)
          ? defaultInstitution
          : allowed[0],
      );
  }, [allowedKey, defaultInstitution]);
  useEffect(() => {
    setActiveStudentId(studentId || '');
  }, [studentId]);
  if (!allowed.length) return null;
  const choicesForInstitution = studentChoices.filter(
    (choice) => choice.institution === institution,
  );
  const isActingForStudent = Boolean(studentId);
  const hasStudentContext = !isActingForStudent || Boolean(activeStudentId);
  return (
    <div className={`sadhana-messages-widget${open && !minimized ? ' is-open' : ''}`}>
      {open && (
        <section
          className="sadhana-messages-widget-panel"
          role="dialog"
          aria-label="Messages"
          aria-hidden={minimized}
          style={minimized ? { display: 'none' } : undefined}
        >
          <header className="sadhana-messages-widget-head">
            <div>
              <strong>Messages</strong>
              {canChooseInstitution && allowed.length > 1 && (
                <label>
                  <span className="sadhana-visually-hidden">Academy</span>
                  <select
                    aria-label="Messages academy"
                    value={institution}
                    onChange={(event) => {
                      const nextInstitution = event.target.value as InstitutionId;
                      const nextChoices = studentChoices.filter(
                        (choice) => choice.institution === nextInstitution,
                      );
                      setInstitution(nextInstitution);
                      setActiveStudentId((current) => {
                        if (nextChoices.some((choice) => choice.id === current)) return current;
                        return nextChoices.length === 1 ? nextChoices[0].id : '';
                      });
                    }}
                  >
                    {allowed.map((id) => (
                      <option key={id} value={id}>
                        {id === 'raaga' ? 'Raagasudha' : 'Śruti Vedam'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <span className="sadhana-messages-widget-controls">
              <button
                type="button"
                onClick={() => setMinimized(true)}
                aria-label="Minimize messages"
                title="Minimize"
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setMinimized(false);
                }}
                aria-label="Close messages"
                title="Close"
              >
                <X size={18} />
              </button>
            </span>
          </header>
          {isActingForStudent && choicesForInstitution.length > 1 && (
            <label className="sadhana-messages-widget-student">
              <span>Student</span>
              <select
                aria-label="Messages student"
                value={activeStudentId}
                onChange={(event) => setActiveStudentId(event.target.value)}
              >
                <option value="">Choose a student</option>
                {choicesForInstitution.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hasStudentContext ? (
            <MessagesPage
              key={`${institution}:${isActingForStudent ? activeStudentId : ''}`}
              cloud={cloud}
              workspace={institution}
              studentId={isActingForStudent ? activeStudentId : undefined}
              compact
            />
          ) : (
            <p className="sadhana-messages-widget-no-student" role="status">
              {choicesForInstitution.length
                ? 'Choose a student to view messages for this academy.'
                : 'No approved student access is available for this academy.'}
            </p>
          )}
        </section>
      )}
      <button
        type="button"
        className="sadhana-messages-widget-trigger"
        aria-label={
          !open ? 'Open messages' : minimized ? 'Restore messages' : 'Hide messages window'
        }
        aria-expanded={open && !minimized}
        onClick={() => {
          if (!open) {
            setOpen(true);
            setMinimized(false);
          } else setMinimized((value) => !value);
        }}
      >
        <MessageCircle size={21} />
        <span>Messages</span>
      </button>
    </div>
  );
}
