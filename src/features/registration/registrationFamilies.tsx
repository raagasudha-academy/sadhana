import {useState} from 'react';
import {ArrowLeft, GraduationCap, Info, Plus, ShieldCheck, X, Trash2, Pencil, Archive, RotateCcw} from 'lucide-react';
import { DirectoryDataMenu, StudentCardBadges } from '../../DirectoryComponents';
import {getEnrolmentStatus,maskPhone,newId,ukISODate} from '../../registry';
import PhoneField from '../../PhoneField';
import {clean, familyLabel, studentLabel, Modal, Field, StudentAvatar, NoResults, relationshipLabel} from './registrationShared';

export function FamilyDetail({
  family,
  members,
  enrolments,
  workspace,
  classes,
  onBack,
  onAddChild,
  onEnrol,
  onUpdate,
  onArchive,
  onRestore,
  onDelete,
  onOpenStudent,
  onArchiveStudent,
  onRestoreStudent,
  onRemoveEnrol,
}: any) {
  const children = members.filter((m) => m.familyId === family.id);
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Family directory
      </button>
      <div className="reg-page-header">
        <div>
          <p className="reg-kicker">SHARED FAMILY RECORD · {familyLabel(family)}</p>
          <h1>{family.parentName}</h1>
          <p>Family details and student enrolments.</p>
        </div>
        <button className="reg-primary" onClick={onAddChild} disabled={!!family.archived}>
          <Plus size={16} /> Add student
        </button>
      </div>
      <div className="reg-family-layout">
        <section className="surface reg-section reg-guardian-card">
          <div className="reg-section-head">
            <h2>Parent / guardian</h2>
            <span className="reg-family-number">#{familyLabel(family)}</span>
          </div>
          <div className="reg-info-row">
            <span>Primary contact</span>
            <strong>{family.parentName}</strong>
          </div>
          <div className="reg-info-row">
            <span>Location</span>
            <strong>{family.location || '—'}</strong>
          </div>
          <div className="reg-info-row">
            <span>WhatsApp</span>
            <strong>{maskPhone(family.phone)}</strong>
          </div>
          <div className="reg-actions reg-family-action-row">
            <button className="reg-secondary" onClick={onUpdate}>
              <Pencil size={15} /> Edit family details
            </button>
            {family.archived ? (
              <button className="reg-secondary" onClick={onRestore}>
                <RotateCcw size={15} /> Restore family
              </button>
            ) : (
              <button className="reg-secondary reg-family-archive" onClick={onArchive}>
                <Archive size={15} /> Archive family
              </button>
            )}
            <button
              type="button"
              className="reg-danger reg-family-permanent-delete"
              onClick={onDelete}
            >
              <Trash2 size={15} /> Delete permanently
            </button>
          </div>
          <div className="reg-info">
            <ShieldCheck size={16} />
            <span>
              Communication consent and Reminder Service activation are managed separately.
            </span>
          </div>
        </section>
        <section className="surface reg-section reg-family-students">
          <div className="reg-section-head">
            <div>
              <h2>Students in family</h2>
              <p className="reg-students-subtitle">
                {children.length} registered {children.length === 1 ? 'student' : 'students'} ·
                Family {familyLabel(family)}
              </p>
            </div>
            <span className="reg-count">{children.length}</span>
          </div>
          <div className="reg-student-cards">
            {children.map((m) => {
              const allEnrolments = enrolments.filter(
                (e) => e.studentId === m.id && e.institution === workspace && !e.archived,
              );
              const activeEnrolments = allEnrolments.filter((e) =>
                ['Active', 'Upcoming'].includes(getEnrolmentStatus(e)),
              );
              const names: string[] = [
                ...new Set<string>(
                  allEnrolments
                    .map((e) => String(classes.find((c) => c.id === e.classId)?.name || ''))
                    .filter(Boolean),
                ),
              ];
              const enrolmentStatus = m.archived
                ? 'Archived'
                : activeEnrolments.length
                  ? 'Enrolled'
                  : names.length
                    ? 'Past enrolment'
                    : 'Not enrolled';
              return (
                <article
                  className={`reg-student-card${m.archived ? ' reg-student-card-archived' : ''}`}
                  key={m.id}
                >
                  <div className="reg-student-main">
                    <StudentAvatar name={m.name} />
                    <div className="reg-student-details">
                      <button
                        type="button"
                        className="reg-student-name"
                        onClick={() => onOpenStudent(m.id)}
                      >
                        {m.name}
                      </button>
                      <div className="reg-student-meta">
                        <span className="reg-roll-pill">{studentLabel(m)}</span>
                        <span>{relationshipLabel(m)}</span>
                        <span>{m.phone ? `WhatsApp ${maskPhone(m.phone)}` : 'Family contact'}</span>
                      </div>
                    </div>
                    <div
                      className="reg-card-icon-actions"
                      role="group"
                      aria-label={`Actions for ${m.name}`}
                    >
                      <button
                        type="button"
                        className="reg-card-icon"
                        title={`Edit profile: ${m.name}`}
                        aria-label={`Edit profile for ${m.name}`}
                        data-hint="Edit profile"
                        onClick={() => onOpenStudent(m.id)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="reg-card-icon"
                        title={
                          m.archived || family.archived
                            ? 'Restore the archived record before enrolling'
                            : `Enrol ${m.name} in class`
                        }
                        aria-label={`Enrol ${m.name} in class`}
                        data-hint="Enrol in class"
                        disabled={!!m.archived || !!family.archived}
                        onClick={() => onEnrol(m.id)}
                      >
                        <GraduationCap size={17} />
                      </button>
                      {m.archived ? (
                        <button
                          type="button"
                          className="reg-card-icon"
                          title={`Restore student: ${m.name}`}
                          aria-label={`Restore student ${m.name}`}
                          data-hint="Restore student"
                          onClick={() => onRestoreStudent(m)}
                        >
                          <RotateCcw size={16} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="reg-card-icon reg-card-icon-danger"
                          title={`Archive student: ${m.name}`}
                          aria-label={`Archive student ${m.name}`}
                          data-hint="Archive student"
                          onClick={() => onArchiveStudent(m)}
                        >
                          <Archive size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <StudentCardBadges
                    archived={!!m.archived}
                    activeEnrolmentCount={activeEnrolments.length}
                    enrolmentStatus={enrolmentStatus}
                  />
                  {!!allEnrolments.length && (
                    <div className="reg-card-class-list">
                      {allEnrolments.map((e) => {
                        const className = classes.find((c) => c.id === e.classId)?.name || 'Class';
                        return (
                          <span key={e.id} className="reg-class-chip sadhana-quick-unenrol-chip">
                            <GraduationCap size={13} />
                            <span>{className}</span>
                            <button
                              type="button"
                              className="sadhana-quick-unenrol-x"
                              aria-label={`Un-enrol ${m.name} from ${className}`}
                              title={`Un-enrol ${m.name} from ${className}`}
                              onClick={() => onRemoveEnrol(e, m.name, className)}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
            {!children.length && (
              <NoResults
                title="No students in this family"
                detail="Use Add student to register the first learner."
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
export function UpdateFamily({ family, onClose, onSave }: any) {
  const [email, setEmail] = useState(family.email || '');
  const [parentName, setParentName] = useState(family.parentName || '');
  const [phone, setPhone] = useState(family.phone || '');
  const [location, setLocation] = useState(family.location || '');
  const [error, setError] = useState('');
  const submit = (e: any) => {
    e.preventDefault();
    const name = clean(parentName);
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!name) {
      setError('Enter the parent / guardian name.');
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setError('Enter a valid international WhatsApp number.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError('Guardian email is required.');
    const changes: any = {};
    if (email.trim().toLowerCase() !== (family.email || ''))
      changes.email = email.trim().toLowerCase();
    if (name !== family.parentName) changes.parentName = name;
    if (normalizedPhone !== family.phone) changes.phone = normalizedPhone;
    if (clean(location) !== (family.location || '')) changes.location = clean(location);
    if (!Object.keys(changes).length) {
      setError('No changes to save.');
      return;
    }
    setError('');
    onSave(changes);
  };
  return (
    <Modal
      title="Update family"
      subtitle="Edit guardian name, WhatsApp and location together. To edit linked student details, open their profile."
      onClose={onClose}
    >
      <form className="reg-form" onSubmit={submit}>
        <Field label="Parent / guardian name *">
          <input
            autoFocus
            required
            maxLength={90}
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
          />
        </Field>
        <Field label="Parent / guardian email *">
          <input
            type="email"
            required
            maxLength={180}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <PhoneField label="Parent / guardian WhatsApp" value={phone} onChange={setPhone} />
        <Field label="Town / City">
          <input
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Middlesbrough"
          />
        </Field>
        <p className="reg-footnote">Changes are saved to the shared family record in DynamoDB.</p>
        {error && (
          <p className="reg-error" role="alert">
            {error}
          </p>
        )}
        <div className="reg-modal-actions">
          <button type="button" className="reg-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="reg-primary">
            Save changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ConvertToFamily({ student, onClose, onSave }: any) {
  const [parentName, setParentName] = useState(student.name || '');
  const [phone, setPhone] = useState(student.phone || '');
  const [location, setLocation] = useState(student.location || '');
  const [error, setError] = useState('');
  return (
    <Modal
      title="Convert individual to family"
      subtitle={`Keep roll number ${studentLabel(student)}, classes and learning history. Allocate a new Family ID.`}
      onClose={onClose}
    >
      <form
        className="reg-form"
        onSubmit={(e) => {
          e.preventDefault();
          const normalized = phone.replace(/[\s-]/g, '');
          if (!clean(parentName) || !/^\+[1-9]\d{7,14}$/.test(normalized))
            return setError('Enter a guardian name and valid international WhatsApp number.');
          onSave({
            parentName: clean(parentName),
            phone: normalized,
            location: clean(location),
            existingStudentId: student.id,
          });
        }}
      >
        <Field label="Parent / guardian name *">
          <input
            required
            maxLength={90}
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
          />
        </Field>
        <PhoneField label="Family WhatsApp" value={phone} onChange={setPhone} />
        <Field label="Town / City">
          <input maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <div className="reg-info">
          <ShieldCheck size={16} />
          <span>
            Your student roll number remains {studentLabel(student)}. Family creation and linking
            are performed together in DynamoDB. Add children from the new family profile afterward.
          </span>
        </div>
        {error && (
          <p role="alert" className="reg-error">
            {error}
          </p>
        )}
        <div className="reg-modal-actions">
          <button type="button" className="reg-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="reg-primary">
            Create family & link student
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ChangeStudentPhone({ student, onClose, onSave }: any) {
  const [value, setValue] = useState(student?.phone || '');
  const [error, setError] = useState('');
  return (
    <Modal
      title="Student WhatsApp contact"
      subtitle={`Optional personal number for ${student?.name}. Parent contact remains unchanged.`}
      onClose={onClose}
    >
      <form
        className="reg-form"
        onSubmit={(e) => {
          e.preventDefault();
          const phone = value.replace(/[\s-]/g, '');
          if (phone && !/^\+[1-9]\d{7,14}$/.test(phone))
            return setError('Use international format, or leave blank to use the parent number.');
          onSave(phone);
        }}
      >
        <PhoneField
          label="Student mobile"
          value={value}
          onChange={setValue}
          optional
          hint="Leave blank to use the family contact."
        />
        <div className="reg-info">
          <Info size={17} />
          <span>
            Setting a mobile number does not activate WhatsApp reminders or grant permission.
            Consent and contact authorisation are handled later.
          </span>
        </div>
        {error && (
          <p className="reg-error" role="alert">
            {error}
          </p>
        )}
        <div className="reg-modal-actions">
          <button className="reg-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="reg-primary" type="submit">
            Save student contact
          </button>
        </div>
      </form>
    </Modal>
  );
}

