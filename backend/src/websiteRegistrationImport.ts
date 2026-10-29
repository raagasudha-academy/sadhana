/** Approved website intake -> atomic Sadhana family/students import. */
import { randomUUID, createHash } from 'node:crypto';
import {queueParentAccess} from './parentAccessProvisioning.ts';
import {provisionParentAccount} from './parentAccountProvisioning.ts';
import { GetCommand, QueryCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { makeRoutedClient } from './tableRouter.ts';
import {
  fetchWebsiteRegistration,
  updateWebsiteRegistrationImport,
} from './websiteRegistrationGateway.ts';
const db = makeRoutedClient();
const table = () => {
  if (!process.env.SADHANA_TABLE_NAME) throw Error('SADHANA_TABLE_NAME missing');
  return process.env.SADHANA_TABLE_NAME;
};
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const key = (kind: 'FAMILY' | 'STUDENT', id: string) => ({
  PK: `OPS#GLOBAL#${kind}`,
  SK: `ITEM#${id}`,
});
const markerKey = (registrationId: string) => ({
  PK: 'OPS#GLOBAL#WEB_IMPORT',
  SK: `ITEM#${registrationId}`,
});
const str = (v: unknown, max = 180) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const validPhone = (v: string) => /^\+[1-9]\d{7,14}$/.test(v);
const emailOK = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};

// Auto-map Raagasudha registration roles and readable locations (v3).
function websiteLocation(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().replace(/^LOC-/i, '').replace(/_/g, ' ') : '';
  if (!raw) return '';
  return raw === raw.toUpperCase()
    ? raw.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : raw;
}

function websiteStudentRole(
  person: Record<string, any>,
  student: Record<string, any>,
  primaryContactId: string,
): { relationship: 'parent_guardian' | 'adult_student' | 'child'; adultConfirmed: boolean } {
  const roles: string[] = Array.isArray(person.roles)
    ? person.roles.map((role: unknown) => String(role).toLowerCase().replace(/[\s-]+/g, '_'))
    : [];
  const type = String(student.studentType || '').toLowerCase().replace(/[\s-]+/g, '_');
  const parent = roles.some((role) => ['parent', 'guardian', 'parent_guardian'].includes(role)) ||
    ['parent_student', 'parent_guardian'].includes(type);
  const adult = parent || roles.some((role) => ['adult', 'adult_student', 'self_student'].includes(role)) ||
    ['adult', 'adult_self', 'adult_student', 'independent', 'self'].includes(type) ||
    student.personId === primaryContactId;
  return { relationship: parent ? 'parent_guardian' : adult ? 'adult_student' : 'child', adultConfirmed: adult };
}

async function allocate(kind: 'FAMILY' | 'STUDENT') {
  const r = await db.send(
    new UpdateCommand({
      TableName: table(),
      Key: { PK: 'OPS#raaga#COUNTERS', SK: kind },
      UpdateExpression: 'ADD #n :one',
      ExpressionAttributeNames: { '#n': 'value' },
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const value = r.Attributes?.value;
  if (!Number.isSafeInteger(value) || value < 1) throw Error('Number allocation failed');
  return String(value).padStart(3, '0');
}
async function existing(id: string) {
  return (
    await db.send(new GetCommand({ TableName: table(), Key: markerKey(id), ConsistentRead: true }))
  ).Item;
}
function unwrap(raw: unknown) {
  const o = obj(raw);
  return o.registration ?? o.record ?? o.item ?? o.data ?? o;
}
async function syncWebsite(registrationId: string, record: any) {
  try {
    await updateWebsiteRegistrationImport(registrationId, {
      status: 'imported',
      familyId: record.familyId,
      studentIds: record.studentIds,
    });
    try { await queueParentAccess(registrationId); } catch (e) { console.error('Parent access enqueue deferred', {registrationId,errorType:e instanceof Error?e.name:'Unknown'}); }
    try { await provisionParentAccount(registrationId); } catch (e) { console.error('Parent account provisioning deferred',{registrationId,errorType:e instanceof Error?e.name:'Unknown'}); }
    return { ...result(record), websiteSynced: true };
  } catch (e) {
    // The committed Sadhana transaction is never rolled back after a website sync failure.
    console.error('Website import mapping sync failed', {
      registrationId,
      errorType: e instanceof Error ? e.name : 'Unknown',
    });
    return {
      ...result(record),
      websiteSynced: false,
      warning:
        'Sadhana records are committed; website status sync is pending. Use Retry sync, not a second import.',
    };
  }
}
function result(record: any) {
  return {
    imported: true,
    alreadyImported: true,
    registrationId: record.registrationId,
    familyId: record.familyId,
    familyNumber: record.familyNumber,
    studentIds: record.studentIds,
    studentRollNumbers: record.studentRollNumbers,
  };
}
export async function importApprovedWebsiteRegistration(registrationId: string, actorSub: string, decision: {linkFamilyId?: string; preview?: boolean; identityCorrection?: {personId:string; originalName:string; correctedName:string}} = {}) {
  if (!/^RS-[A-Za-z0-9_-]{1,110}$/.test(registrationId))
    throw fail(400, 'Invalid website registration ID.');
  const prior = await existing(registrationId);
  if (prior) return decision.preview === true ? {...result(prior), websiteSynced: true} : syncWebsite(registrationId, prior);
  const registration = obj(unwrap(await fetchWebsiteRegistration(registrationId)));
  if (registration.registrationId !== registrationId)
    throw fail(409, 'Website registration ID mismatch.');
  if (registration.reviewStatus !== 'approved')
    throw fail(409, 'Approve this website application before importing.');
  if (registration.sadhanaImport?.status === 'imported')
    throw fail(
      409,
      'Website reports an earlier import, but no local mapping was found. Investigate before retrying.',
    );
  const people = Array.isArray(registration.people) ? registration.people : [];
  const students = Array.isArray(registration.students) ? registration.students : [];
  if (students.length < 1 || students.length > 20)
    throw fail(400, 'Import requires 1–20 students.');
  const personIds = students.map((s: any) => str(s?.personId, 120));
  if (
    personIds.some(
      (x: string) => !x || !personIds.every((p: string) => /^[A-Za-z0-9_-]{1,120}$/.test(p)),
    ) ||
    new Set(personIds).size !== personIds.length
  )
    throw fail(
      409,
      'Invalid or repeated student person IDs; resolve the website submission before importing.',
    );
  const personMap = new Map(people.map((p: any) => [p?.personId, p]));
  const guardian = obj(personMap.get(registration.primaryContactPersonId));
  const parentName = str(guardian.fullName);
  const email = str(guardian.email).toLowerCase();
  const phone = str(guardian.phone);
  if (!parentName || !emailOK(email) || !validPhone(phone))
    throw fail(
      422,
      'Primary contact must have a name, valid email and international phone before import.',
    );
  const parsed = students.map((s: any) => {
    const p = obj(personMap.get(s.personId));
    const name = str(p.fullName);
    if (!name || !str(p.dateOfBirth))
      throw fail(422, 'Each student must have a name and date of birth.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(p.dateOfBirth)))
      throw fail(422, 'Student date of birth is invalid.');
    const { relationship, adultConfirmed: isAdult } = websiteStudentRole(p, s, String(registration.primaryContactPersonId || ''));
    // This is an administrative student record, NOT a verified portal identity.
    const memberEmail = isAdult
      ? str(p.email).toLowerCase()
      : s.contactPreferences?.emailSource === 'guardian'
        ? email
        : str(p.email).toLowerCase();
    const memberPhone = isAdult
      ? str(p.phone)
      : s.contactPreferences?.phoneSource === 'guardian'
        ? phone
        : str(p.phone);
    if (isAdult && (!emailOK(memberEmail) || !validPhone(memberPhone)))
      throw fail(422, 'Adult student needs own valid email and international phone.');
    const allergy = obj(s.foodAllergies);
    if (!['yes', 'none', 'unknown'].includes(allergy.status))
      throw fail(422, 'Every student must have a confirmed allergy response.');
    return {
      sourcePersonId: s.personId,
      name,
      dateOfBirth: str(p.dateOfBirth),
      email: memberEmail,
      phone: memberPhone,
      adultConfirmed: isAdult,
      location: websiteLocation(s.preferredLocationId || registration.preferredLocationId),
      relationship,
      foodAllergies: {
        status: allergy.status,
        allergens: Array.isArray(allergy.allergens)
          ? allergy.allergens.filter((a: any) => typeof a === 'string').slice(0, 30)
          : [],
        otherAllergens: str(allergy.otherAllergens, 250),
        reactionDetails: str(allergy.reactionDetails, 1000),
        emergencyInstructions: str(allergy.emergencyInstructions, 1000),
        carriesEmergencyMedication: allergy.carriesEmergencyMedication === true,
      },
      preferredClassId: str(s.preferredClassId),
      proposedStartDate: str(s.proposedStartDate),
      photo: s.photo ? { websiteRegistrationId: registrationId, personId: s.personId } : undefined,
      contactPreferences: obj(s.contactPreferences),
      // Preserve the address selected in the website intake form, including guardian inheritance.
      contactAddress: obj(s.contactPreferences).addressSource === 'guardian'
        ? obj(guardian.address)
        : obj(p.address),
      guardianSourcePersonId: relationship === 'child'
        ? str(obj(s.contactPreferences).guardianPersonId || registration.primaryContactPersonId, 120)
        : undefined,
    };
  });
  // A confirmed correction is scoped to one source person ID; never rewrite the website submission.
  // Accept only when the source contains a same-name-and-DOB collision, and retain its audit details.
  let identityCorrectionAudit: {personId:string; originalName:string; correctedName:string; dateOfBirth:string}|undefined;
  if (decision.identityCorrection) {
    const correction = decision.identityCorrection;
    if (!correction || typeof correction !== 'object' ||
        typeof correction.personId !== 'string' || typeof correction.originalName !== 'string' ||
        typeof correction.correctedName !== 'string') throw fail(400, 'Invalid identity correction.');
    const target = parsed.find(p => p.sourcePersonId === correction.personId);
    const proposed = correction.correctedName.trim().replace(/\s+/g, ' ');
    if (!target || target.name !== correction.originalName || !/^[\p{L}][\p{L} .'-]{1,89}$/u.test(proposed) ||
        proposed.toLocaleLowerCase('en-GB') === target.name.toLocaleLowerCase('en-GB'))
      throw fail(409, 'Correction no longer matches the website record; refresh and review.');
    const duplicateInSource = parsed.some(p => p.sourcePersonId !== target.sourcePersonId &&
      p.dateOfBirth === target.dateOfBirth && p.name.trim().toLocaleLowerCase('en-GB') === target.name.trim().toLocaleLowerCase('en-GB'));
    if (!duplicateInSource) throw fail(409, 'Name correction is permitted only for a repeated name and date of birth.');
    identityCorrectionAudit = {personId: target.sourcePersonId, originalName:target.name, correctedName:proposed, dateOfBirth:target.dateOfBirth};
    target.name = proposed;
  }
  const nameDob = parsed.map((p) => `${p.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB')}|${p.dateOfBirth}`);
  if (new Set(nameDob).size !== nameDob.length)
    throw fail(409, 'Duplicate student name and date of birth detected; resolve before import.');
  for (const p of parsed) {
    if (p.email && !emailOK(p.email)) throw fail(422, `Invalid student email for ${p.name}.`);
    if (p.phone && !validPhone(p.phone)) throw fail(422, `Invalid student phone for ${p.name}.`);
  }
  // Fail closed on possible duplicate identities BEFORE allocating any roll numbers.
  // The name + DOB match is a review signal, not proof of the same person or relationship.
  const normalizedIdentity = (name: string, dob: string) =>
    `${name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB')}|${dob}`;
  const existingStudents: any[] = [];
  let nextKey: Record<string, any> | undefined;
  do {
    const page = await db.send(new QueryCommand({
      TableName: table(), KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'OPS#GLOBAL#STUDENT' },
      ConsistentRead: true, Limit: 100, ExclusiveStartKey: nextKey,
    }));
    existingStudents.push(...(page.Items || []));
    nextKey = page.LastEvaluatedKey;
    if (existingStudents.length > 10000)
      throw fail(409, 'Duplicate check exceeded safe directory limit; administrator review required.');
  } while (nextKey);
  for (const student of parsed) {
    const identity = normalizedIdentity(student.name, student.dateOfBirth);
    if (existingStudents.some((existingStudent) =>
      existingStudent.dateOfBirth &&
      normalizedIdentity(String(existingStudent.name || ''), String(existingStudent.dateOfBirth)) === identity)) {
      throw fail(409, `Possible existing student: ${student.name} (${student.dateOfBirth}). Review and link the existing person before activation; no new record was created.`);
    }
  }
  // An independent adult has no real family identity. Keep the technical family
  // record temporarily for the existing website API's mandatory familyId mapping,
  // but reserve the 000 roll-number prefix for independent adults.
  const independentAdult = parsed.length === 1 && parsed[0].relationship === 'adult_student';
  const identityKeys = parsed.map((student) => ({
    ...markerKey(registrationId),
    SK: `IDENTITY#${createHash('sha256').update(normalizedIdentity(student.name, student.dateOfBirth)).digest('hex')}`,
    sourceRegistrationId: registrationId,
    createdAt: new Date().toISOString(),
  }));
  // Match families by verified E.164 contact, never by name alone. A match is a
  // suggestion; require an explicit administrator decision before reusing it.
  const possibleFamilies: any[] = [];
  let familyCursor: Record<string, any> | undefined;
  do {
    const page = await db.send(new QueryCommand({
      TableName: table(), KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'OPS#GLOBAL#FAMILY' },
      ConsistentRead: true, Limit: 100, ExclusiveStartKey: familyCursor,
    }));
    possibleFamilies.push(...(page.Items || []).filter((f: any) =>
      f.institution === 'raaga' && !f.archived && f.phone === phone));
    familyCursor = page.LastEvaluatedKey;
    if (possibleFamilies.length > 20) throw fail(409, 'Too many family matches; manual review required.');
  } while (familyCursor);
  if (possibleFamilies.length > 1) throw fail(409, 'Several families share this contact number. Resolve the relationship manually before activation.');
  const matchedFamily = possibleFamilies[0];
  if (decision.preview === true) {
    return { requiresFamilyConfirmation: Boolean(matchedFamily),
      candidate: matchedFamily ? {familyId: matchedFamily.id, familyNumber: matchedFamily.familyNumber,
        parentName: matchedFamily.parentName, phone: matchedFamily.phone} : null,
      registrationId, studentNames: parsed.map((p) => p.name) };
  }
  if (matchedFamily && decision.linkFamilyId !== matchedFamily.id)
    throw fail(409, 'Existing family found for this phone. Preview and confirm the family relationship before activation.');
  if (!matchedFamily && decision.linkFamilyId)
    throw fail(409, 'Selected family is no longer a unique match. Refresh and review.');
  if (matchedFamily && (!matchedFamily.id || !matchedFamily.familyNumber || !Number.isSafeInteger(matchedFamily.version)))
    throw fail(409, 'Matched family is incomplete; manual review required.');
  const useExistingFamily = Boolean(matchedFamily);
  const familyNumber = useExistingFamily ? String(matchedFamily.familyNumber) : await allocate('FAMILY');
  const studentNumbers: string[] = [];
  for (const _ of parsed) studentNumbers.push(await allocate('STUDENT'));
  const familyId = useExistingFamily ? matchedFamily.id : `FAMILY-${randomUUID()}`;
  const now = new Date().toISOString();
  const fam = {
    ...key('FAMILY', familyId),
    id: familyId,
    institution: 'raaga',
    parentName,
    email,
    phone,
    location: websiteLocation(registration.preferredLocationId),
    familyNumber,
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: actorSub,
    sourceWebsiteRegistrationId: registrationId,
    contactAddress: obj(guardian.address),
  };
  const studentRows = parsed.map((p, i) => {
    const id = `STUDENT-${randomUUID()}`;
    return {
      ...key('STUDENT', id),
      ...p,
      id,
      familyId,
      studentNumber: studentNumbers[i],
      rollNumber: `${independentAdult ? '000' : familyNumber}-${studentNumbers[i]}`,
      institution: 'raaga',
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: actorSub,
      sourceWebsiteRegistrationId: registrationId,
    };
  });
  const studentIds = Object.fromEntries(studentRows.map((s) => [s.sourcePersonId, s.id]));
  const studentRollNumbers = Object.fromEntries(
    studentRows.map((s) => [s.sourcePersonId, s.rollNumber]),
  );
  const marker = {
    ...markerKey(registrationId),
    registrationId,
    familyId,
    familyNumber,
    independentAdult,
    linkedExistingFamily: useExistingFamily,
    identityCorrection: identityCorrectionAudit,
    studentIds,
    studentRollNumbers,
    actorSub,
    createdAt: now,
  };
  const audit = {
    PK: 'AUDIT#raaga',
    SK: `AT#${now}#${randomUUID()}`,
    entityType: 'AUDIT',
    type: 'WEBSITE_REGISTRATION_IMPORTED',
    resource: 'ops-family',
    id: familyId,
    registrationId,
    identityCorrection: identityCorrectionAudit,
    studentIds: Object.values(studentIds),
    actorSub,
    at: now,
  };
  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          ...(useExistingFamily ? [{ ConditionCheck: {
            TableName: table(), Key: key('FAMILY', familyId),
            ConditionExpression: '#v = :v AND phone = :phone AND institution = :inst AND (attribute_not_exists(archived) OR archived = :false)',
            ExpressionAttributeNames: { '#v': 'version' },
            ExpressionAttributeValues: { ':v': matchedFamily.version, ':phone': phone, ':inst': 'raaga', ':false': false },
          }}] : [{ Put: { TableName: table(), Item: fam, ConditionExpression: 'attribute_not_exists(PK)' }}]),
          ...[...studentRows, marker, audit, ...identityKeys].map((Item) => ({
            Put: { TableName: table(), Item, ConditionExpression: 'attribute_not_exists(PK)' },
          })),
        ],
      }),
    );
  } catch (e: any) {
    if (e?.name === 'TransactionCanceledException') {
      const committed = await existing(registrationId);
      if (committed) return syncWebsite(registrationId, committed);
      throw fail(
        409,
        'Import transaction conflict. Refresh and retry; number allocations are never reused.',
      );
    }
    throw e;
  }
  return { ...(await syncWebsite(registrationId, marker)), alreadyImported: false };
}
