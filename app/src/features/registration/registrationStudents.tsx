import { useState } from 'react';
import {
  ArrowLeft,
  GraduationCap,
  Plus,
  UsersRound,
  Trash2,
  Pencil,
  RotateCcw,
  CalendarDays,
} from 'lucide-react';
import { institutions } from '../../institutions';
import { getEnrolmentStatus, maskPhone, newId, ukISODate } from '../../registry';
import { lastFourWeeks, reportForStudent } from '../../practiceMath';
import {
  familyLabel,
  readableLocation,
  studentLabel,
  Status,
  NoResults,
  relationshipLabel,
  fmtDate,
} from './registrationShared';

export function StudentRecord({
  person,
  family,
  enrollments,
  workspace,
  classes,
  onBack,
  onEnrol,
  onEditName,
  onConvert,
  onRemove,
  onRestore,
  onEditEnrol,
  onRemoveEnrol,
  practiceLogs = [],
}: any) {
  const [tab, setTab] = useState('Overview');
  const list = enrollments.filter((e) => e.studentId === person.id && e.institution === workspace);
  const period = lastFourWeeks();
  const calculated = reportForStudent(
    person.id,
    workspace,
    period.from,
    period.to,
    enrollments,
    classes,
    practiceLogs,
  );
  const activeEnrolments = list.filter((e) => getEnrolmentStatus(e) === 'Active');
  const upcomingEnrolments = list.filter((e) => getEnrolmentStatus(e) === 'Upcoming');
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Students
      </button>
      <div className="reg-page-header">
        <div>
          <p className="reg-kicker">
            {institutions[workspace].name.toUpperCase()} · STUDENT PROFILE
          </p>
          <h1>{person.name}</h1>
          <p>
            Roll No. {studentLabel(person)} · {institutions[workspace].name} enrolments
          </p>
        </div>
        <div className="reg-actions">
          <button className="reg-primary" onClick={() => onEnrol(person.id)}>
            <Plus size={16} /> Enrol in class
          </button>
          <button className="reg-secondary" onClick={onEditName}>
            <Pencil size={15} /> Update
          </button>
          {!family && (
            <button className="reg-secondary" onClick={onConvert}>
              <UsersRound size={15} /> Convert to family
            </button>
          )}
          {person.archived ? (
            <button className="reg-secondary" onClick={onRestore}>
              <RotateCcw size={15} /> Restore student
            </button>
          ) : (
            <button className="reg-danger" onClick={onRemove}>
              <Trash2 size={15} /> Remove student
            </button>
          )}
        </div>
      </div>
      <section className="surface reg-section">
        <div className="reg-tabs">
          {['Overview', 'Classes', 'Practice', 'Attendance', 'Notes'].map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Overview' && (
          <div className="reg-two-inner">
            <div>
              <h2>Student information</h2>
              <div className="reg-info-row">
                <span>Student ID</span>
                <strong>{studentLabel(person)}</strong>
              </div>
              <div className="reg-info-row">
                <span>Classification</span>
                <strong>
                  {person.adultConfirmed && person.relationship !== 'parent_guardian'
                    ? 'Independent Adult Student'
                    : relationshipLabel(person)}
                </strong>
              </div>
              <div className="reg-info-row">
                <span>Family ID</span>
                <strong>{family ? familyLabel(family) : '000 · Independent learner'}</strong>
              </div>
              <div className="reg-info-row">
                <span>Parent / guardian</span>
                <strong>
                  {person.adultConfirmed && (!family || family.parentName === person.name)
                    ? 'Not applicable'
                    : family?.parentName || 'Independent Student'}
                </strong>
              </div>
              <div className="reg-info-row">
                <span>Location</span>
                <strong>{readableLocation(person.location || family?.location) || '—'}</strong>
              </div>
              <div className="reg-info-row">
                <span>Email</span>
                <strong>{person.email || family?.email || '—'}</strong>
              </div>
              <div className="reg-info-row">
                <span>Contact</span>
                <strong>{family ? maskPhone(family.phone) : maskPhone(person.phone)}</strong>
              </div>
              <div className="reg-info-row">
                <span>Student WhatsApp</span>
                <strong>
                  {person.phone
                    ? maskPhone(person.phone)
                    : family
                      ? 'Uses parent’s number'
                      : 'Not recorded'}
                </strong>
              </div>
              {person.dateOfBirth && (
                <div className="reg-info-row">
                  <span>Date of birth</span>
                  <strong>{fmtDate(person.dateOfBirth)}</strong>
                </div>
              )}
              {person.contactAddress && (
                <div className="reg-info-row">
                  <span>Postal address</span>
                  <strong>
                    {Object.values(person.contactAddress).filter(Boolean).join(', ') || '—'}
                  </strong>
                </div>
              )}
              {person.preferredClassId && (
                <div className="reg-info-row">
                  <span>Requested class</span>
                  <strong>{person.preferredClassId}</strong>
                </div>
              )}
              {person.proposedStartDate && (
                <div className="reg-info-row">
                  <span>Proposed start date</span>
                  <strong>{fmtDate(person.proposedStartDate)}</strong>
                </div>
              )}
              {person.sourceWebsiteRegistrationId && (
                <div className="reg-info-row">
                  <span>Website registration</span>
                  <strong>{person.sourceWebsiteRegistrationId}</strong>
                </div>
              )}
              {person.sourceWebsiteRegistrationId && (
                <div className="reg-info-row">
                  <span>Import status</span>
                  <strong>Imported</strong>
                </div>
              )}
              {person.contactPreferences && (
                <div className="reg-info-row">
                  <span>Contact preferences</span>
                  <strong>{`Email: ${person.contactPreferences.emailSource || '—'}; Phone: ${person.contactPreferences.phoneSource || '—'}; Address: ${person.contactPreferences.addressSource || '—'}`}</strong>
                </div>
              )}
              {person.foodAllergies && (
                <div className="reg-info-row">
                  <span>Food allergies / medical instructions</span>
                  <strong>
                    {[
                      person.foodAllergies.status === 'none'
                        ? 'No known food allergies'
                        : person.foodAllergies.status === 'unknown'
                          ? 'Unknown'
                          : person.foodAllergies.status === 'yes'
                            ? 'Reported allergies'
                            : String(person.foodAllergies.status || '—'),
                      ...(person.foodAllergies.allergens || []),
                      person.foodAllergies.otherAllergens,
                      person.foodAllergies.reactionDetails,
                      person.foodAllergies.emergencyInstructions,
                      person.foodAllergies.carriesEmergencyMedication
                        ? 'Carries emergency medication'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </strong>
                </div>
              )}
              <div className="reg-info-row">
                <span>Current classes</span>
                <strong>{new Set(activeEnrolments.map((e) => e.classId)).size}</strong>
              </div>
              <div className="reg-info-row">
                <span>Upcoming classes</span>
                <strong>{new Set(upcomingEnrolments.map((e) => e.classId)).size}</strong>
              </div>
            </div>
            <div className="reg-feature">
              <h3>Practice snapshot</h3>
              <div className="reg-metrics">
                <div>
                  <strong>
                    {calculated.practiceRate == null ? 'No data' : `${calculated.practiceRate}%`}
                  </strong>
                  <span>Practice Rate</span>
                </div>
                <div>
                  <strong>
                    {calculated.submissionRate == null
                      ? 'No data'
                      : `${calculated.submissionRate}%`}
                  </strong>
                  <span>Submission Rate</span>
                </div>
              </div>
              <small>
                Calculated only from records entered in this browser session; live practice history
                is not connected yet.
              </small>
            </div>
          </div>
        )}
        {tab === 'Classes' && (
          <>
            <h2>Class enrolments</h2>
            <div className="reg-stack">
              {list.length ? (
                list.map((e) => {
                  const c = classes.find((c) => c.id === e.classId);
                  return (
                    <div className="reg-enrol-row" key={e.id}>
                      <GraduationCap size={19} />
                      <div>
                        <strong>{c?.name}</strong>
                        <small>
                          {fmtDate(e.startDate)} {e.endDate ? `– ${fmtDate(e.endDate)}` : ''} ·{' '}
                          {e.id}
                        </small>
                      </div>
                      <Status status={getEnrolmentStatus(e)} />
                      <button className="reg-secondary" onClick={() => onEditEnrol(e)}>
                        Edit dates
                      </button>
                      <button
                        type="button"
                        className="reg-danger"
                        onClick={() => onRemoveEnrol(e, person.name, c?.name || 'Class')}
                      >
                        Remove enrolment
                      </button>
                    </div>
                  );
                })
              ) : (
                <NoResults
                  title="No enrolment yet"
                  detail="Use Enrol in class to create a record."
                />
              )}
            </div>
          </>
        )}
        {tab === 'Practice' && (
          <>
            <h2>Practice records (last four weeks)</h2>
            <div className="reg-metrics">
              <div>
                <strong>
                  {calculated.practiceRate == null ? 'No data' : calculated.practiceRate + '%'}
                </strong>
                <span>Practice Rate</span>
              </div>
              <div>
                <strong>
                  {calculated.submissionRate == null ? 'No data' : calculated.submissionRate + '%'}
                </strong>
                <span>Submission Rate</span>
              </div>
              <div>
                <strong>{calculated.minutes} min</strong>
                <span>Total minutes</span>
              </div>
            </div>
            <p className="reg-muted">
              Record or correct practice from Practice & Reports. Voided records do not contribute
              to totals.
            </p>
            <div className="reg-stack">
              {practiceLogs
                .filter(
                  (l) =>
                    l.studentId === person.id &&
                    l.institution === workspace &&
                    l.date >= period.from &&
                    l.date <= period.to,
                )
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((l) => (
                  <div className="reg-enrol-row" key={l.id}>
                    <CalendarDays size={16} />
                    <div>
                      <strong>
                        {l.date}: {l.didPractice ? 'Yes' : 'No'} · {l.minutes} min
                      </strong>
                      <small>
                        {l.comments || 'No comment'} · {l.status}
                      </small>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
        {tab === 'Attendance' && (
          <>
            <h2>Attendance RSVPs</h2>
            <p className="reg-muted">
              Session RSVP information will be connected in the attendance phase.
            </p>
          </>
        )}
        {tab === 'Notes' && (
          <>
            <h2>Internal teacher notes</h2>
            <p className="reg-muted">
              Protected institutional notes remain separate and are not included in report exports.
            </p>
            <NoResults
              title="No teacher notes"
              detail="Teacher notes will appear after this feature is connected to the database."
            />
          </>
        )}
      </section>
    </>
  );
}
