import {useState} from 'react';
import {Plus, ShieldCheck, X} from 'lucide-react';
import PhoneField from '../../PhoneField';
import {clean, familyLabel, Modal, Field} from './registrationShared';

export function RegisterFamily({ onSave, onClose }: any) {
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [parentLearner, setParentLearner] = useState(false);
  const [members, setMembers] = useState([
    { uid: 1, name: '', phone: '', email: '', relationship: 'child' },
  ]);
  const [nextUid, setNextUid] = useState(2);
  const [error, setError] = useState('');
  const change = (uid: number, part: any) =>
    setMembers((prev) => prev.map((m) => (m.uid === uid ? { ...m, ...part } : m)));
  const submit = (e: any) => {
    e.preventDefault();
    const familyPhone = phone.replace(/[\s-]/g, '');
    const familyEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(familyEmail))
      return setError('Enter the parent / guardian email address.');
    if (!clean(parentName) || !/^\+[1-9]\d{7,14}$/.test(familyPhone))
      return setError('Enter guardian name and a valid international WhatsApp number.');
    const learners = members.map((m) => ({
      name: clean(m.name),
      email: m.email.trim().toLowerCase(),
      phone: m.phone.replace(/[\s-]/g, ''),
      relationship: m.relationship,
    }));
    if (
      learners.some(
        (m) =>
          (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) ||
          (m.relationship === 'parent_guardian' && (!m.email || !m.phone)),
      )
    )
      return setError(
        'Adult family learners require both email and phone; check any optional child email addresses.',
      );
    if (parentLearner)
      learners.unshift({
        name: clean(parentName),
        email: familyEmail,
        phone: familyPhone,
        relationship: 'parent_guardian',
      });
    if (
      !learners.length ||
      learners.some((m) => !m.name || (m.phone && !/^\+[1-9]\d{7,14}$/.test(m.phone)))
    )
      return setError('Add at least one learner and check all learner names and contact numbers.');
    const names = learners.map((m) => m.name.toLowerCase());
    if (new Set(names).size !== names.length)
      return setError('Each learner must have a distinct name in this registration.');
    setError('');
    onSave({
      parentName: clean(parentName),
      email: familyEmail,
      phone: familyPhone,
      location: clean(location),
      members: learners,
    });
  };
  return (
    <Modal
      title="Register a family"
      subtitle="Create one family and several learner records together. Only learners receive roll numbers."
      onClose={onClose}
    >
      <form onSubmit={submit} className="reg-form">
        <div className="reg-form-section">Parent / guardian</div>
        <div className="reg-family-contact-fields">
          <Field label="Parent / guardian name *">
            <input
              autoFocus
              required
              maxLength={90}
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Full name"
            />
          </Field>
          <PhoneField label="WhatsApp" value={phone} onChange={setPhone} />
        </div>
        <Field label="Parent / guardian email *">
          <input
            type="email"
            required
            maxLength={180}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="parent@example.com"
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
        <label className="reg-checkbox">
          <input
            type="checkbox"
            checked={parentLearner}
            onChange={(e) => setParentLearner(e.target.checked)}
          />
          <span>Parent / guardian is also a student</span>
        </label>
        {parentLearner && (
          <p className="reg-footnote">
            The parent will receive a student record classified as Parent / Guardian + Student.
          </p>
        )}
        <div className="reg-form-section">Family learners</div>
        {members.map((m, i) => (
          <div key={m.uid} className="reg-review reg-family-member-card">
            <div className="reg-section-head">
              <strong>Family member {i + 1}</strong>
              <button
                type="button"
                className="reg-outline-small"
                onClick={() => setMembers((v) => v.filter((x) => x.uid !== m.uid))}
              >
                <X size={14} /> Remove
              </button>
            </div>
            <Field label="Full name *">
              <input
                maxLength={90}
                value={m.name}
                onChange={(e) => change(m.uid, { name: e.target.value })}
                placeholder="Full name"
              />
            </Field>
            <Field label="Classification">
              <select
                value={m.relationship}
                onChange={(e) => change(m.uid, { relationship: e.target.value })}
              >
                <option value="child">Child + Student</option>
                <option value="other">Other Family Member + Student</option>
                <option value="parent_guardian">Parent / Guardian + Student</option>
              </select>
            </Field>
            <Field label="Email (required for adults, optional for children)">
              <input
                type="email"
                maxLength={180}
                value={m.email}
                onChange={(e) => change(m.uid, { email: e.target.value })}
                placeholder="learner@example.com"
              />
            </Field>
            <Field label="WhatsApp (optional)">
              <input
                value={m.phone}
                onChange={(e) => change(m.uid, { phone: e.target.value })}
                placeholder="Uses family contact"
              />
            </Field>
          </div>
        ))}
        <button
          type="button"
          className="reg-secondary"
          onClick={() => {
            setMembers((v) => [
              ...v,
              { uid: nextUid, name: '', phone: '', email: '', relationship: 'child' },
            ]);
            setNextUid((x) => x + 1);
          }}
        >
          <Plus size={16} /> Add another family member
        </button>
        <div className="reg-info">
          <ShieldCheck size={17} />
          <span>
            {members.length + (parentLearner ? 1 : 0)} student record(s) will be created. Guardians
            not studying stay in the family directory only. Messaging is not activated.
          </span>
        </div>
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
            Create family & learners
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RegisterIndependent({ onSave, onClose }: any) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const normalized = phone.replace(/[\s-]/g, '');
    if (!clean(name)) return setError('Enter the student name.');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized))
      return setError('Enter a valid student WhatsApp number with an international country code.');
    if (!adult)
      return setError('Independent registration is available to adults aged 18 or older.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError('Email is required for independent adult students.');
    onSave({
      name: clean(name),
      email: email.trim().toLowerCase(),
      phone: normalized,
      location: clean(location),
    });
  };
  return (
    <Modal
      title="Register an independent student"
      subtitle="For adult learners with their own contact details and no family record."
      onClose={onClose}
    >
      <form className="reg-form" onSubmit={submit}>
        <Field label="Student full name *">
          <input
            autoFocus
            required
            maxLength={90}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adult learner name"
          />
        </Field>
        <Field label="Student email *">
          <input
            type="email"
            required
            maxLength={180}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
          />
        </Field>
        <PhoneField
          label="Student WhatsApp"
          value={phone}
          onChange={setPhone}
          hint="Independent Students use their own contact number."
        />
        <Field label="Town / City">
          <input
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Carlisle"
          />
        </Field>
        <label className="reg-checkbox">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I confirm that this learner is 18 or older.</span>
        </label>
        <div className="reg-info">
          <ShieldCheck size={17} />
          <span>
            Independent students are registered without a family record and receive their own
            permanent Student ID. They can be linked to a family later.
          </span>
        </div>
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
            <Plus size={16} /> Register student
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function AddChild({ family, onSave, onClose }: any) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal
      title="Add another student"
      subtitle={`Add a student to ${familyLabel(family)}, without duplicating family contacts.`}
      onClose={onClose}
    >
      <form
        className="reg-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!clean(name)) return;
          const normalized = phone.replace(/[\s-]/g, '');
          if (normalized && !/^\+[1-9]\d{7,14}$/.test(normalized))
            return setError('Enter a valid international phone number or leave it blank.');
          if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
            return setError('Enter a valid email or leave blank.');
          onSave({
            name: clean(name),
            email: email.trim().toLowerCase(),
            phone: normalized,
            location: clean(family.location || ''),
          });
        }}
      >
        <Field label="Student full name *">
          <input
            autoFocus
            required
            maxLength={90}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </Field>
        <Field label="Student email (optional for children)">
          <input
            type="email"
            maxLength={180}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} optional />
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
            <Plus size={16} /> Add student
          </button>
        </div>
      </form>
    </Modal>
  );
}
