import { entityTable } from './entityTables.mjs';
/** Opt-in M9 practice and RSVP writes: only M9 tables, with fresh identity checks.
 * Leave disabled on the existing deployed Lambda until isolated end-to-end tests pass.
 */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';
import { isWithinPracticeWindow } from './practiceWindow.ts';
import { matchingCognitoPerson, authorisedStudent } from './finalAccessCore.mjs';
import {
  validatePractice,
  validateRsvp,
  isActiveEnrolment,
  canRsvp,
} from './learnerWriteRules.mjs';

export interface M9LearnerWriteDb {
  send(command: any): Promise<any>;
}
const table = (domain: string) => entityTable(domain);
const verifiedInstitution = (inst: InstitutionId) => {
  if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Choose an academy');
  return inst;
};
const validateId = (id: string) => {
  if (typeof id !== 'string' || !/^[-_a-zA-Z0-9]{4,150}$/.test(id))
    throw httpError(400, 'Invalid learner identifier');
  return id;
};
const today = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const field = (name: string) => parts.find((p) => p.type === name)?.value || '';
  return `${field('year')}-${field('month')}-${field('day')}`;
};
const clock = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
export function makeM9LearnerWrites(db: M9LearnerWriteDb) {
  const get = async (domain: string, key: string, value: string) =>
    (
      await db.send(
        new GetCommand({ TableName: table(domain), Key: { [key]: value }, ConsistentRead: true }),
      )
    ).Item ?? null;
  async function query(domain: string, index: string, key: string, value: string) {
    const rows: any[] = [];
    let cursor: any;
    do {
      const r = await db.send(
        new QueryCommand({
          TableName: table(domain),
          IndexName: index,
          KeyConditionExpression: '#k=:v',
          ExpressionAttributeNames: { '#k': key },
          ExpressionAttributeValues: { ':v': value },
          Limit: 100,
          ExclusiveStartKey: cursor,
        }),
      );
      rows.push(...(r.Items || []));
      cursor = r.LastEvaluatedKey;
      if (rows.length > 2000) throw httpError(413, 'Too many learner records');
    } while (cursor);
    return rows;
  }
  async function identity(inst: InstitutionId, claims: Claims, studentId: string) {
    verifiedInstitution(inst);
    validateId(studentId);
    if (!claims.sub) throw httpError(403, 'Student access denied');
    const candidates = await query('people', 'CognitoIdentityIndex', 'cognitoSub', claims.sub);
    const actor = matchingCognitoPerson(candidates, claims.sub, inst);
    if (!actor) throw httpError(403, 'A verified portal identity is required');
    const activeActor = await get('people', 'personId', actor.personId);
    if (
      !activeActor ||
      activeActor.cognitoSub !== claims.sub ||
      activeActor.status !== 'active' ||
      !activeActor.institutionIds?.includes(inst)
    )
      throw httpError(403, 'A verified portal identity is required');
    const student = await get('people', 'personId', studentId);
    let links: any[] = [];
    if (activeActor.personId !== studentId) {
      const candidates = await query(
        'family-links',
        'GuardianAccessIndex',
        'guardianPersonId',
        activeActor.personId,
      );
      links = (
        await Promise.all(
          candidates
            .filter((x) => x.studentId === studentId && x.institutionId === inst)
            .map((x) => get('family-links', 'linkId', x.linkId)),
        )
      ).filter(Boolean);
    }
    authorisedStudent(activeActor, student, links, inst);
    // A ConditionCheck in the transaction protects against revoked access between read and write.
    const checks: any[] =
      activeActor.personId === studentId
        ? [
            {
              ConditionCheck: {
                TableName: table('people'),
                Key: { personId: studentId },
                ConditionExpression:
                  '#s=:a AND cognitoSub=:sub AND contains(institutionIds,:inst) AND contains(personTypes,:student)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':a': 'active',
                  ':sub': claims.sub,
                  ':inst': inst,
                  ':student': 'student',
                },
              },
            },
          ]
        : [
            {
              ConditionCheck: {
                TableName: table('people'),
                Key: { personId: activeActor.personId },
                ConditionExpression: '#s=:a AND cognitoSub=:sub AND contains(institutionIds,:inst)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: { ':a': 'active', ':sub': claims.sub, ':inst': inst },
              },
            },
            {
              ConditionCheck: {
                TableName: table('people'),
                Key: { personId: studentId },
                ConditionExpression:
                  '#s=:a AND contains(institutionIds,:inst) AND contains(personTypes,:student)',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: { ':a': 'active', ':inst': inst, ':student': 'student' },
              },
            },
          ];
    if (activeActor.personId !== studentId) {
      const link = links.find(
        (x) =>
          x.guardianPersonId === actor.personId &&
          x.studentId === studentId &&
          x.institutionId === inst &&
          x.accessStatus === 'approved' &&
          x.relationshipVerified === true,
      );
      checks.push({
        ConditionCheck: {
          TableName: table('family-links'),
          Key: { linkId: link.linkId },
          ConditionExpression:
            'accessStatus=:approved AND relationshipVerified=:verified AND guardianPersonId=:actor AND studentId=:student AND institutionId=:inst',
          ExpressionAttributeValues: {
            ':approved': 'approved',
            ':verified': true,
            ':actor': actor.personId,
            ':student': studentId,
            ':inst': inst,
          },
        },
      });
    }
    return { actor, checks };
  }
  async function enrolled(inst: InstitutionId, studentId: string, classId: string, date: string) {
    const rows = await query('enrolments', 'StudentEnrolmentsIndex', 'studentId', studentId);
    const matching = rows.filter((e) => isActiveEnrolment(e, inst, studentId, classId, date));
    if (!matching.length)
      throw httpError(403, 'Student was not enrolled in this class on that date');
    const current = (
      await Promise.all(matching.map((e) => get('enrolments', 'enrolmentId', e.enrolmentId)))
    ).filter((e) => isActiveEnrolment(e, inst, studentId, classId, date));
    if (!current.length) throw httpError(403, 'Student enrolment is not active');
    const item = current[0];
    return {
      ConditionCheck: {
        TableName: table('enrolments'),
        Key: { enrolmentId: item.enrolmentId },
        ConditionExpression:
          '#s=:active AND studentId=:student AND classId=:class AND institutionId=:inst AND (attribute_not_exists(startDate) OR attribute_type(startDate,:nullType) OR startDate=:empty OR startDate<=:date) AND (attribute_not_exists(endDate) OR attribute_type(endDate,:nullType) OR endDate=:empty OR endDate>=:date)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':active': 'active',
          ':student': studentId,
          ':class': classId,
          ':inst': inst,
          ':date': date,
          ':empty': '',
          ':nullType': 'NULL',
        },
      },
    };
  }
  async function ensureClass(inst: InstitutionId, classId: string) {
    const row = await get('classes', 'classId', classId);
    if (!row || row.institutionId !== inst || row.status === 'archived')
      throw httpError(403, 'Class does not belong to the academy');
  }
  async function savePractice(
    inst: InstitutionId,
    claims: Claims,
    studentId: string,
    body: any,
    practiceId?: string,
  ) {
    if (
      process.env.SADHANA_ENTITY_TABLE_SET === 'final'
        ? process.env.SADHANA_FINAL_LEARNER_WRITES !== 'enabled'
        : process.env.M9_LEARNER_WRITES !== 'enabled'
    )
      throw httpError(503, 'Learner writes disabled');
    const { actor, checks } = await identity(inst, claims, studentId);
    const input = validatePractice(body, isWithinPracticeWindow);
    await ensureClass(inst, input.classId);
    const enrolmentCheck = await enrolled(inst, studentId, input.classId, input.date);
    const existing = (
      await query('practice', 'StudentPracticeIndex', 'studentId', studentId)
    ).filter((p) => p.institutionId === inst);
    const old = practiceId ? await get('practice', 'practiceId', validateId(practiceId)) : null;
    if (practiceId && (!old || old.institutionId !== inst || old.studentId !== studentId))
      throw httpError(404, 'Your practice entry was not found');
    if (old && (!Number.isInteger(input.expectedVersion) || old.version !== input.expectedVersion))
      throw httpError(409, 'Practice changed; refresh before editing');
    if (old && !isWithinPracticeWindow(old.practiceDate))
      throw httpError(409, 'The seven-day practice correction window has closed');
    if (old && (old.practiceDate !== input.date || old.classId !== input.classId))
      throw httpError(409, 'Date/class cannot be changed on an existing entry');
    if (old && old.teacherReviewed === true)
      throw httpError(409, 'Teacher has reviewed this practice; corrections are locked');
    if (
      existing.some(
        (p) =>
          p.practiceId !== practiceId &&
          p.classId === input.classId &&
          p.practiceDate === input.date,
      )
    )
      throw httpError(409, 'Practice already recorded for this class and date');
    // Deterministic ID makes simultaneous duplicate submissions conflict safely.
    const id = old?.practiceId || `PRACTICE-${inst}-${studentId}-${input.classId}-${input.date}`;
    const now = new Date().toISOString();
    const item = {
      practiceId: id,
      institutionId: inst,
      studentId,
      classId: input.classId,
      practiceDate: input.date,
      practiceDateKey: input.date,
      minutes: input.minutes,
      topic: input.topic,
      comments: input.comments,
      didPractice: true,
      version: (old?.version || 0) + 1,
      createdAt: old?.createdAt || now,
      updatedAt: now,
      updatedBy: claims.sub,
    };
    const audit = {
      auditId: `AUDIT-${randomUUID()}`,
      institutionId: inst,
      action: old ? 'studentPracticeEdit' : 'studentPracticeCreate',
      actorCognitoSub: claims.sub,
      actorPersonId: actor.personId,
      timestamp: now,
      resourceType: 'practice',
      resourceId: id,
    };
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            ...checks,
            enrolmentCheck,
            {
              Put: {
                TableName: table('practice'),
                Item: item,
                ...(old
                  ? {
                      ConditionExpression:
                        '#v=:v AND (attribute_not_exists(teacherReviewed) OR teacherReviewed=:notReviewed)',
                      ExpressionAttributeNames: { '#v': 'version' },
                      ExpressionAttributeValues: { ':v': old.version, ':notReviewed': false },
                    }
                  : { ConditionExpression: 'attribute_not_exists(practiceId)' }),
              },
            },
            {
              Put: {
                TableName: table('audit'),
                Item: audit,
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
    } catch (e: any) {
      if (e.name === 'TransactionCanceledException')
        throw httpError(409, 'Practice or access changed. Refresh and retry');
      throw e;
    }
    return {
      record: {
        id,
        studentId,
        classId: input.classId,
        date: input.date,
        minutes: input.minutes,
        topic: input.topic,
        comments: input.comments,
        version: item.version,
      },
    };
  }
  async function saveRsvp(inst: InstitutionId, claims: Claims, studentId: string, body: any) {
    if (
      process.env.SADHANA_ENTITY_TABLE_SET === 'final'
        ? process.env.SADHANA_FINAL_LEARNER_WRITES !== 'enabled'
        : process.env.M9_LEARNER_WRITES !== 'enabled'
    )
      throw httpError(503, 'Learner writes disabled');
    const input = validateRsvp(body);
    for (let attempt = 0; attempt < 2; attempt++) {
      // Re-read identity, session, enrolment and RSVP on a retry. This retries only
      // a concurrent RSVP-row write; changed access or enrolment still fails closed.
      const { actor, checks } = await identity(inst, claims, studentId);
      const session = await get('sessions', 'sessionId', input.sessionId);
      if (
        !session ||
        session.institutionId !== inst ||
        ['cancelled', 'canceled', 'deleted'].includes(String(session.status)) ||
        !canRsvp(session, today(), clock())
      )
        throw httpError(409, 'RSVP is only available for upcoming classes');
      const date = session.localDate || session.legacyPayload?.date;
      await ensureClass(inst, session.classId);
      const enrolmentCheck = await enrolled(inst, studentId, session.classId, date);
      const id = `RSVP-${inst}-${studentId}-${input.sessionId}`;
      const old = await get('rsvps', 'rsvpId', id);
      if (
        old &&
        (old.institutionId !== inst ||
          old.studentId !== studentId ||
          old.sessionId !== input.sessionId)
      )
        throw httpError(409, 'RSVP identifier conflict');
      const now = new Date().toISOString();
      const item = {
        rsvpId: id,
        institutionId: inst,
        studentId,
        sessionId: input.sessionId,
        rsvpTargetKey: `session#${input.sessionId}`,
        intention: input.intention,
        note: '',
        respondedAt: now,
        version: (old?.version || 0) + 1,
        createdAt: old?.createdAt || now,
        updatedAt: now,
        updatedBy: claims.sub,
      };
      const audit = {
        auditId: `AUDIT-${randomUUID()}`,
        institutionId: inst,
        action: 'learnerRSVP',
        actorCognitoSub: claims.sub,
        actorPersonId: actor.personId,
        timestamp: now,
        resourceType: 'rsvp',
        resourceId: id,
      };
      const rsvpWriteIndex = checks.length + 1;
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              ...checks,
              enrolmentCheck,
              {
                Put: {
                  TableName: table('rsvps'),
                  Item: item,
                  ...(old
                    ? {
                        ConditionExpression: '#v=:v',
                        ExpressionAttributeNames: { '#v': 'version' },
                        ExpressionAttributeValues: { ':v': old.version },
                      }
                    : { ConditionExpression: 'attribute_not_exists(rsvpId)' }),
                },
              },
              {
                Put: {
                  TableName: table('audit'),
                  Item: audit,
                  ConditionExpression: 'attribute_not_exists(auditId)',
                },
              },
            ],
          }),
        );
        return {
          record: {
            id,
            studentId,
            sessionId: input.sessionId,
            intention: input.intention,
            version: item.version,
          },
        };
      } catch (e: any) {
        if (e?.name !== 'TransactionCanceledException') throw e;
        const reasons = Array.isArray(e.CancellationReasons) ? e.CancellationReasons : [];
        // DynamoDB can cancel an RSVP write when another selection wins between
        // the consistent read and transaction, or when transactions briefly overlap.
        // Refresh identity and enrolment before one bounded retry.
        if (
          attempt === 0 &&
          (reasons[rsvpWriteIndex]?.Code === 'ConditionalCheckFailed' ||
            reasons.some((reason: any) => reason?.Code === 'TransactionConflict'))
        )
          continue;
        if (reasons[checks.length]?.Code === 'ConditionalCheckFailed')
          throw httpError(409, 'Your class enrolment changed. Refresh and try again');
        if (
          reasons
            .slice(0, checks.length)
            .some((reason: any) => reason?.Code === 'ConditionalCheckFailed')
        )
          throw httpError(409, 'Your student or family access changed. Refresh and try again');
        if (reasons[rsvpWriteIndex]?.Code === 'ConditionalCheckFailed')
          throw httpError(409, 'Your RSVP was updated elsewhere. Refresh and try again');
        throw httpError(409, 'RSVP or access changed. Refresh and retry');
      }
    }
    throw httpError(409, 'RSVP changed while saving. Refresh and retry');
  }
  return { savePractice, saveRsvp };
}
let singleton: ReturnType<typeof makeM9LearnerWrites> | undefined;
export function m9LearnerWrites() {
  return (singleton ??= makeM9LearnerWrites(
    DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      { marshallOptions: { removeUndefinedValues: true } },
    ),
  ));
}
