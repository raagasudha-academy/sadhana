/** Validated Sruti public registration -> approved M9 website-import contract. Pure/no AWS. */
import { randomBytes } from 'node:crypto';
const reject = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x, max = 200) => {
  if (typeof x !== 'string' || x.length > max) reject('Invalid field length/type.');
  return x.trim();
};
const requireText = (x, max = 120) => {
  const v = str(x, max);
  if (!v) reject('Required registration field missing.');
  return v;
};
const date = (x) => {
  const s = requireText(x, 10);
  if (
    !/^\d{4}-\d\d-\d\d$/.test(s) ||
    !Number.isFinite(Date.parse(s + 'T00:00:00Z')) ||
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s ||
    s > new Date().toISOString().slice(0, 10)
  )
    reject('Invalid birth date.');
  return s;
};
const ageCutoff = (years) => {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};
const phone = (x) => {
  let s = requireText(x, 35).replace(/[\s().-]/g, '');
  if (/^0\d{10}$/.test(s)) s = '+44' + s.slice(1);
  if (/^44\d{10}$/.test(s)) s = '+' + s;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) reject('Enter a valid international phone number.');
  return s;
};
const bounded = (x, max = 500) => str(x ?? '', max);
const learner = (s, kind) => {
  if (!plain(s)) reject('Invalid learner details.');
  const firstName = requireText(s.firstName, 100),
    lastName = requireText(s.lastName, 100);
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    dateOfBirth: date(s.dateOfBirth),
    applicantType: kind,
    gender: bounded(s.gender, 30),
    school: bounded(s.school, 150),
    interests: bounded(s.interests, 150),
    experience: bounded(s.experience, 1500),
    allergies: bounded(s.allergies, 1500),
    medicalNotes: bounded(s.medicalNotes, 1500),
  };
};
export function validateSrutiSubmission(
  value,
  { allowLegacyMissingGuardianDateOfBirth = false } = {},
) {
  const methods = plain(value?.consents?.contactMethods) ? value.consents.contactMethods : {};
  const photographyChoice = value?.consents?.photographyChoice;
  if (
    !plain(value) ||
    value.institution !== 'sruti' ||
    !['self', 'child', 'both'].includes(value.registrationType) ||
    !plain(value.guardian) ||
    !plain(value.consents) ||
    value.consents.registration !== true ||
    typeof methods.phone !== 'boolean' ||
    typeof methods.email !== 'boolean' ||
    (!methods.phone && !methods.email) ||
    !['granted', 'declined'].includes(photographyChoice) ||
    value.consents.photography !== (photographyChoice === 'granted')
  )
    reject('Invalid Sruti registration or missing consent.');
  if (
    Object.keys(value).some(
      (k) =>
        ![
          'institution',
          'registrationType',
          'guardian',
          'students',
          'consents',
          'website',
        ].includes(k),
    )
  )
    reject('Unexpected registration fields.');
  if (!Array.isArray(value.students) || value.students.length < 1 || value.students.length > 12)
    reject('Invalid number of learners.');
  const g = value.guardian;
  const firstName = requireText(g.firstName, 100),
    lastName = requireText(g.lastName, 100),
    email = requireText(g.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject('Invalid email address.');
  const guardianDateOfBirth = g.dateOfBirth ? date(g.dateOfBirth) : undefined;
  if (!guardianDateOfBirth && !allowLegacyMissingGuardianDateOfBirth)
    reject('Parent or self applicants must be over 18.');
  if (guardianDateOfBirth && guardianDateOfBirth > ageCutoff(19))
    reject('Parent or self applicants must be over 18.');
  const guardian = {
    firstName,
    lastName,
    ...(guardianDateOfBirth ? { dateOfBirth: guardianDateOfBirth } : {}),
    gender: bounded(g.gender, 30),
    email,
    phone: phone(g.phone),
    relationship: bounded(g.relationship, 30),
    address1: requireText(g.address1, 200),
    address2: bounded(g.address2, 200),
    city: requireText(g.city, 100),
    postcode: requireText(g.postcode, 20),
    emergencyName: requireText(g.emergencyName, 150),
    emergencyPhone: phone(g.emergencyPhone),
    additionalNotes: bounded(g.additionalNotes, 1500),
  };
  const kinds = value.students.map((x) => x?.applicantType);
  const selfCount = kinds.filter((x) => x === 'self').length,
    childCount = kinds.filter((x) => x === 'child').length;
  if (
    selfCount !== (value.registrationType === 'child' ? 0 : 1) ||
    childCount < (value.registrationType === 'self' ? 0 : 1) ||
    childCount > 11 ||
    value.students.some((s) => s?.photo != null)
  )
    reject('Learner types or photographs are invalid.');
  const students = value.students.map((x) => learner(x, x.applicantType));
  if (
    students.some(
      (x) =>
        x.applicantType === 'self' &&
        (x.firstName.toLowerCase() !== firstName.toLowerCase() ||
          x.lastName.toLowerCase() !== lastName.toLowerCase() ||
          (guardianDateOfBirth && x.dateOfBirth !== guardianDateOfBirth)),
    )
  )
    reject('Self applicant must match the adult primary contact.');
  const over18Cutoff = ageCutoff(19);
  const under18Cutoff = ageCutoff(18);
  if (students.some((x) => x.applicantType === 'self' && x.dateOfBirth > over18Cutoff))
    reject('Self applicants must be over 18.');
  if (students.some((x) => x.applicantType === 'child' && x.dateOfBirth <= under18Cutoff))
    reject('Child applicants must be under 18.');
  return {
    institution: 'sruti',
    registrationType: value.registrationType,
    guardian,
    students,
    consents: {
      registration: true,
      contactMethods: { phone: methods.phone, email: methods.email },
      photographyChoice,
      photography: photographyChoice === 'granted',
    },
  };
}
export function newSrutiIntakeRecord(
  payload,
  now = new Date().toISOString(),
  registrationId = 'SR-' +
    new Date(now).getUTCFullYear() +
    '-' +
    randomBytes(3).toString('hex').toUpperCase(),
) {
  if (!/^SR-[A-Za-z0-9-]{1,110}$/.test(registrationId)) reject('Invalid registration ID.');
  return {
    registrationId,
    institutionId: 'sruti',
    source: 'sruti-website',
    status: 'submitted',
    reviewStatus: 'pending',
    importStatus: 'pending',
    registrationType: payload.registrationType,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1,
    submission: payload,
  };
}
export function toApprovedM9Registration(record) {
  if (
    !plain(record) ||
    record.source !== 'sruti-website' ||
    record.institutionId !== 'sruti' ||
    record.reviewStatus !== 'approved' ||
    record.importStatus !== 'pending' ||
    !/^SR-[A-Za-z0-9-]{1,110}$/.test(record.registrationId)
  )
    reject('Sruti record is not approved and pending import.');
  const payload = validateSrutiSubmission(record.submission, {
    allowLegacyMissingGuardianDateOfBirth: true,
  });
  const g = payload.guardian;
  const primaryId = 'sruti-primary';
  const address = { line1: g.address1, line2: g.address2, city: g.city, postcode: g.postcode };
  const people = [
    {
      personId: primaryId,
      fullName: g.firstName + ' ' + g.lastName,
      email: g.email,
      phone: g.phone,
      address,
      emergencyContact: { name: g.emergencyName, phone: g.emergencyPhone },
      roles: payload.registrationType === 'child' ? ['guardian'] : ['guardian', 'student'],
    },
  ];
  const students = [];
  for (const [i, s] of payload.students.entries()) {
    const personId = s.applicantType === 'self' ? primaryId : `sruti-child-${i + 1}`;
    if (s.applicantType === 'self') {
      people[0].dateOfBirth = s.dateOfBirth;
    } else
      people.push({
        personId,
        fullName: s.fullName,
        dateOfBirth: s.dateOfBirth,
        roles: ['student'],
      });
    const answer = s.allergies.toLowerCase();
    const allergyStatus = !answer
      ? 'unknown'
      : ['none', 'no', 'nil', 'n/a'].includes(answer)
        ? 'none'
        : 'yes';
    students.push({
      personId,
      studentType: s.applicantType === 'self' ? 'adult' : 'child',
      foodAllergies: { status: allergyStatus, details: s.allergies },
      contactPreferences: {
        emailSource: 'guardian',
        phoneSource: 'guardian',
        addressSource: 'guardian',
        guardianPersonId: primaryId,
      },
      srutiLearning: {
        gender: s.gender,
        school: s.school,
        interests: s.interests,
        experience: s.experience,
        medicalNotes: s.medicalNotes,
      },
    });
  }
  return {
    registrationId: record.registrationId,
    institution: 'sruti',
    reviewStatus: 'approved',
    registrationType: payload.registrationType,
    submittedAt: record.submittedAt,
    mediaConsent: {
      granted: payload.consents.photography,
      choice: payload.consents.photographyChoice,
      recordedAt: record.submittedAt,
    },
    contactMethods: payload.consents.contactMethods,
    primaryContactPersonId: primaryId,
    people,
    students,
  };
}
