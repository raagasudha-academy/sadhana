import { useState } from 'react';
import { ArrowRight, CircleAlert, Info, Search, Trash2 } from 'lucide-react';
import { institutions } from '../../institutions';
import { getEnrolmentStatus, maskPhone, newId, ukISODate } from '../../registry';
import PhoneField from '../../PhoneField';
import {
  clean,
  familyLabel,
  studentLabel,
  Status,
  Modal,
  Field,
  fmtDate,
} from './registrationShared';

export function EnrolModal({
  workspace,
  members,
  families,
  enrolments,
  classes: classRecords,
  presetStudent,
  presetClass,
  onClose,
  onSave,
}: any) {
  const [studentId, setStudentId] = useState(presetStudent || '');
  const [studentQuery, setStudentQuery] = useState('');
  const [classId, setClassId] = useState(presetClass || '');
  const [startDate, setStartDate] = useState(ukISODate());
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const classes = classRecords.filter((c) => c.institution === workspace);
  const person = members.find((m) => m.id === studentId);
  const selectedClass = classes.find((c) => c.id === classId);
  const fam = families.find((f) => f.id === person?.familyId);
  const duplicate = enrolments.some(
    (e) =>
      e.studentId === studentId && e.classId === classId && getEnrolmentStatus(e) !== 'Archived',
  );
  const overlap = enrolments
    .filter(
      (e) =>
        e.studentId === studentId &&
        e.institution === workspace &&
        getEnrolmentStatus(e) !== 'Archived' &&
        e.classId !== classId,
    )
    .map((e) => classRecords.find((c) => c.id === e.classId))
    .filter(
      (c) =>
        c &&
        selectedClass &&
        c.day === selectedClass.day &&
        (() => {
          const start = (x) => Number(x.time.split(':')[0]) * 60 + Number(x.time.split(':')[1]);
          return (
            start(c) < start(selectedClass) + selectedClass.duration &&
            start(selectedClass) < start(c) + c.duration
          );
        })(),
    );
  const check = (e) => {
    e.preventDefault();
    setError('');
    if (!studentId || !classId || !startDate)
      return setError('Choose a student, class and start date.');
    if (duplicate)
      return setError('This student already has an active or upcoming enrolment in that class.');
    setConfirmed(true);
  };
  return (
    <Modal
      title="Enrol student"
      subtitle={`Add an enrolment to ${institutions[workspace].name}; student IDs are preserved.`}
      onClose={onClose}
    >
      <form
        className="reg-form"
        onSubmit={
          confirmed
            ? (e) => {
                e.preventDefault();
                onSave({ studentId, classId, startDate });
              }
            : check
        }
      >
        {!confirmed ? (
          <>
            <Field label="Find student">
              <input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Search name or roll number"
              />
            </Field>
            <Field label="Select student *">
              <select required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Choose student</option>
                {members
                  .filter(
                    (m) =>
                      !studentQuery ||
                      `${m.name} ${studentLabel(m)}`
                        .toLowerCase()
                        .includes(studentQuery.toLowerCase()) ||
                      m.id === studentId,
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {studentLabel(m)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Class *">
              <select required value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Enrolment start date *">
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            {person && (
              <div className="reg-info">
                <Info size={17} />
                <span>
                  Student match: {person.name} ({studentLabel(person)}),{' '}
                  {fam ? `Family ${familyLabel(fam)}` : 'Independent learner'}. Student identity is
                  shared across academies; enrolments are academy-specific.
                </span>
              </div>
            )}
            {duplicate && (
              <p className="reg-error" role="alert">
                Already enrolled or due to join this class.
              </p>
            )}
            {overlap.length > 0 && (
              <div className="reg-warning">
                <CircleAlert size={17} />
                <span>
                  Possible overlapping class: {overlap.map((c) => c.name).join(', ')}. You may
                  review and proceed.
                </span>
              </div>
            )}
            {error && (
              <p className="reg-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <div className="reg-review">
            <h3>Review enrolment</h3>
            <div>
              <span>Student</span>
              <strong>
                {person?.name} ({studentLabel(person)})
              </strong>
            </div>
            <div>
              <span>Institution</span>
              <strong>{institutions[workspace].name}</strong>
            </div>
            <div>
              <span>Class</span>
              <strong>{selectedClass?.name}</strong>
            </div>
            <div>
              <span>Starts</span>
              <strong>{fmtDate(startDate)}</strong>
            </div>
            <div>
              <span>Status</span>
              <Status status={startDate > ukISODate() ? 'Upcoming' : 'Active'} />
            </div>
            {overlap.length > 0 && (
              <p className="reg-warning">
                Conflict warning reviewed: {overlap.map((c) => c.name).join(', ')}
              </p>
            )}
          </div>
        )}
        <div className="reg-modal-actions">
          <button
            type="button"
            className="reg-secondary"
            onClick={confirmed ? () => setConfirmed(false) : onClose}
          >
            {confirmed ? 'Back' : 'Cancel'}
          </button>
          <button disabled={duplicate} className="reg-primary" type="submit">
            {confirmed ? 'Confirm enrolment' : 'Review enrolment'} <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function EditName({ kind, record, family, onSave, onClose }: any) {
  const [email, setEmail] = useState(record.email || '');
  const [name, setName] = useState(kind === 'family' ? record.parentName : record.name);
  const [location, setLocation] = useState(record.location || family?.location || '');
  const [phone, setPhone] = useState(record.phone || '');
  const [relationship, setRelationship] = useState(record.relationship || 'child');
  const [error, setError] = useState('');
  return (
    <Modal
      title="Update student"
      subtitle="Update student name and town/city. The roll number stays unchanged."
      onClose={onClose}
    >
      <form
        className="reg-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean(name)) {
            const n = phone.replace(/[\s-]/g, '');
            if (n && !/^\+[1-9]\d{7,14}$/.test(n))
              return setError('Enter an international phone number, or leave it blank.');
            if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
              return setError('Enter a valid email.');
            if (!record.familyId && !email.trim())
              return setError('Adult student email is required.');
            onSave({
              name: clean(name),
              email: email.trim().toLowerCase(),
              location: clean(location),
              phone: n,
              ...(record.familyId ? { relationship } : {}),
            });
          }
        }}
      >
        <Field label="Student name *">
          <input
            autoFocus
            required
            maxLength={90}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Town / City">
          <input
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Newcastle"
          />
        </Field>
        <Field label="Student email">
          <input
            type="email"
            maxLength={180}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} optional />
        {record.familyId && (
          <Field label="Family classification">
            <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
              <option value="child">Child + Student</option>
              <option value="parent_guardian">Parent / Guardian + Student</option>
              <option value="other">Other Family Member + Student</option>
            </select>
          </Field>
        )}
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
export function ConfirmRemove({
  title,
  description,
  actionLabel,
  onClose,
  onConfirm,
  blocked = false,
  onDemoHardDelete,
}: any) {
  const [word, setWord] = useState('');
  return (
    <Modal title={title} subtitle="Protected removal — local session only" onClose={onClose}>
      <div className="reg-form">
        <div className={blocked ? 'reg-warning' : 'reg-info'}>
          <CircleAlert size={17} />
          <span>{description}</span>
        </div>
        <div className="reg-modal-actions">
          <button className="reg-secondary" onClick={onClose}>
            Cancel
          </button>
          {!blocked && (
            <button className="reg-danger" onClick={onConfirm}>
              <Trash2 size={15} />
              {actionLabel}
            </button>
          )}
        </div>
        {onDemoHardDelete && (
          <div className="reg-form">
            <div className="reg-form-section">Discard local records</div>
            <p className="reg-muted">
              To test full Delete, type DELETE. This clears linked local enrolments and practice
              records. It does not affect DynamoDB. Live deletion will require separate safeguards.
            </p>
            <Field label="Type DELETE to confirm">
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </Field>
            <button
              type="button"
              className="reg-danger"
              disabled={word !== 'DELETE'}
              onClick={onDemoHardDelete}
            >
              <Trash2 size={15} /> Discard local records
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
export function EditEnrolment({ entry, onSave, onClose }: any) {
  const [startDate, setStartDate] = useState(entry.startDate);
  const [endDate, setEndDate] = useState(entry.endDate || '');
  const [error, setError] = useState('');
  return (
    <Modal
      title="Edit enrolment dates"
      subtitle="End dates archive an enrolment after its final active day."
      onClose={onClose}
    >
      <form
        className="reg-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (endDate && endDate < startDate)
            return setError('End date cannot be before start date.');
          onSave({ startDate, endDate });
        }}
      >
        <div className="reg-form-grid">
          <Field label="Start date">
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="End date (optional)">
            <input
              type="date"
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        {error && <p className="reg-error">{error}</p>}
        <div className="reg-modal-actions">
          <button type="button" className="reg-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="reg-primary">
            Save enrolment
          </button>
        </div>
      </form>
    </Modal>
  );
}
