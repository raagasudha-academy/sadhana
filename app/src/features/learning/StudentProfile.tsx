import { useEffect, useState } from 'react';
import type { StudentPortalContext } from './useStudentPortalController';
import AcademyBrandIcon from '../../AcademyBrandIcon';
import type { CloudSession } from '../../CloudAuth';

type AccountProfile = Awaited<ReturnType<CloudSession['api']['getMyProfile']>>;

export function StudentProfile({ context }: { context: StudentPortalContext }) {
  const {
    cloud,
    inst,
    extras,
    preferredName,
    setPreferredName,
    about,
    setAbout,
    uploadBusy,
    media,
    updateProfile,
    uploadEvidence,
    students,
    activeId,
    detail,
  } = context;
  const activeStudent = students.find((s) => s.id === activeId);
  const isSelf = activeStudent?.relationship === 'self';
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [phone, setPhone] = useState(''),
    [code, setCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'edit' | 'verify'>('edit');
  const [phoneBusy, setPhoneBusy] = useState(false),
    [phoneError, setPhoneError] = useState(''),
    [phoneNotice, setPhoneNotice] = useState('');
  useEffect(() => {
    let active = true;
    if (isSelf) {
      cloud.api
        .getMyProfile()
        .then((profile) => {
          if (active) {
            setAccountProfile(profile);
            setPhone(profile.phone || '');
          }
        })
        .catch((error) => {
          if (active)
            setPhoneError(error instanceof Error ? error.message : 'Unable to load account phone');
        });
    } else setAccountProfile(null);
    return () => {
      active = false;
    };
  }, [cloud.api, isSelf, cloud.staff.subject]);
  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setPhoneBusy(true);
    setPhoneError('');
    setPhoneNotice('');
    try {
      const normalized = phone.replace(/[\s().-]/g, '');
      if (!/^\+[1-9]\d{7,14}$/.test(normalized))
        throw Error('Enter a valid international number, such as +447700900123.');
      await cloud.beginPhoneChange(normalized);
      setPhone(normalized);
      setPhoneStep('verify');
      setPhoneNotice('Code sent to the new number.');
    } catch (error) {
      setPhoneError(
        error instanceof Error ? error.message : 'Could not send the verification code',
      );
    } finally {
      setPhoneBusy(false);
    }
  };
  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setPhoneBusy(true);
    setPhoneError('');
    setPhoneNotice('');
    try {
      await cloud.verifyPhoneChange(code);
      const updated = await cloud.api.getMyProfile();
      setAccountProfile(updated);
      setPhone(updated.phone || '');
      setPhoneStep('edit');
      setCode('');
      setPhoneNotice('Phone number verified.');
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : 'Could not verify the phone number');
    } finally {
      setPhoneBusy(false);
    }
  };
  return (
    <section className="sv123-student-profile">
      <h3>My student profile</h3>
      <div className="sv123-profile">
        {media.find((m) => m.purpose === 'profile' && m.mime.startsWith('image/')) ? (
          <img
            className="sv125-student-photo"
            src={media.find((m) => m.purpose === 'profile' && m.mime.startsWith('image/'))?.url}
            alt="Student profile"
          />
        ) : (
          <AcademyBrandIcon academy={inst} size={48} />
        )}
        <div>
          <strong>{activeStudent?.name || detail.student.name}</strong>
          <p>Roll number: {detail.student.rollNumber || 'Not assigned'}</p>
          <p>Academy: {inst === 'raaga' ? 'Raagasudha' : 'Śruti Vedam'}</p>
        </div>
      </div>
      <p>
        Legal name, login email, roll number and date of birth are protected. Contact the academy to
        request official changes.
      </p>
      <form className="sv125-profile-form" onSubmit={(e) => void updateProfile(e)}>
        <label>
          Preferred display name
          <input
            value={preferredName}
            maxLength={80}
            onChange={(e) => setPreferredName(e.target.value)}
          />
        </label>
        <label>
          About me
          <textarea value={about} maxLength={500} onChange={(e) => setAbout(e.target.value)} />
        </label>
        <button type="submit" disabled={!extras}>
          Save profile preferences
        </button>
      </form>
      <section className="sv123-verified-phone" aria-label="Verified phone number">
        <h4>Verified phone number</h4>
        {isSelf ? (
          <>
            <p>Update the phone number on your student sign-in account.</p>
            {accountProfile && (
              <p className="sv123-current-phone">
                {accountProfile.phone || 'No phone number added'} ·{' '}
                {accountProfile.phoneVerified ? 'Verified' : 'Not verified'}
              </p>
            )}
            {phoneError && (
              <p className="sv123-phone-error" role="alert">
                {phoneError}
              </p>
            )}
            {phoneStep === 'edit' ? (
              <form onSubmit={(e) => void sendCode(e)}>
                <label>
                  New phone number
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+447700900123"
                  />
                </label>
                <button type="submit" disabled={phoneBusy || !phone.trim()}>
                  {phoneBusy ? 'Sending…' : 'Send verification code'}
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => void verifyCode(e)}>
                <label>
                  SMS verification code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </label>
                <div className="sv123-phone-actions">
                  <button type="submit" disabled={phoneBusy || !code.trim()}>
                    {phoneBusy ? 'Verifying…' : 'Verify number'}
                  </button>
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={() => {
                      setPhoneStep('edit');
                      setCode('');
                      setPhoneError('');
                      setPhoneNotice('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {phoneNotice && (
              <p className="sv123-phone-notice" role="status">
                {phoneNotice}
              </p>
            )}
          </>
        ) : (
          <p>Sign in with the student’s own account to update its verified phone number.</p>
        )}
      </section>
      <h4>My private uploads</h4>
      <label className="sv125-upload">
        Profile photo (JPG, PNG, WebP or HEIC)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
          disabled={uploadBusy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadEvidence(f, 'profile');
            e.target.value = '';
          }}
        />
      </label>
      <p>Private uploads are visible only to approved people.</p>
      {media.length ? (
        <ul>
          {media.map((m) => (
            <li key={m.id}>
              <a href={m.url} target="_blank" rel="noreferrer">
                {m.purpose} · {new Date(m.createdAt).toLocaleDateString()}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No uploads yet.</p>
      )}
    </section>
  );
}
