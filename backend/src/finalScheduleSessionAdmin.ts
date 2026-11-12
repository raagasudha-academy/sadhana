/** Canonical final-table session and master-class lifecycle actions.
 * No legacy PK/SK or sadhana-dev-main access. All mutations are versioned and audited.
 */
import { randomUUID, createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';
import { scheduleChanges, validateScheduleRecord } from './scheduleModel.ts';
import type { ScheduleRecord } from './scheduleModel.ts';
import { utcForWallTime } from './calendarWrite.ts';
import { makeLearnerActivityNotifications } from './learnerActivityNotifications.ts';

export type DB = { send: (command: any) => Promise<any> };
const ID = /^[-a-zA-Z0-9]{4,90}$/;
const MAX_ROWS = 6000;
const MAX_CLASS_DELETES = 80;
const MAX_DELETE_SESSIONS = 80;
const writableFields = new Set([
  'name',
  'programme',
  'mode',
  'location',
  'date',
  'endDate',
  'startTime',
  'endTime',
  'status',
  'expectedVersion',
]);
const createFields = new Set([
  'recordType',
  'classId',
  'name',
  'programme',
  'mode',
  'location',
  'date',
  'endDate',
  'startTime',
  'endTime',
  'status',
  'allDay',
]);

function invalidChange(err: unknown): never {
  if (
    ['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(
      (err as Error)?.name,
    )
  )
    throw httpError(409, 'Record changed. Refresh and retry.');
  throw err;
}
function checkId(id: string) {
  if (!ID.test(id)) throw httpError(400, 'Invalid record ID.');
}
function checkVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw httpError(400, 'Current expectedVersion required.');
}
function audit(inst: InstitutionId, action: string, id: string, actor: string) {
  const timestamp = new Date().toISOString();
  return {
    auditId: `final_schedule_${randomUUID()}`,
    institutionId: inst,
    action,
    actorCognitoSub: actor,
    timestamp,
    resourceType: 'schedule',
    resourceId: id,
    schemaVersion: 1,
  };
}

export function makeM10FinalScheduleSessionAdmin(db: DB) {
  const activity = makeLearnerActivityNotifications(db);
  const table = (kind: string) => entityTable(kind);
  const get = async (kind: 'classes' | 'sessions', id: string) => {
    const result = await db.send(
      new GetCommand({
        TableName: table(kind),
        Key: kind === 'classes' ? { classId: id } : { sessionId: id },
        ConsistentRead: true,
      }),
    );
    return result.Item as Record<string, any> | undefined;
  };
  async function scan(
    kind:
      'people' | 'sessions' | 'enrolments' | 'attendance' | 'rsvps' | 'homework' | 'submissions',
  ) {
    const records: Record<string, any>[] = [];
    let cursor: Record<string, any> | undefined;
    do {
      const page = await db.send(
        new ScanCommand({
          TableName: table(kind),
          Limit: 200,
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
      );
      records.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (records.length > MAX_ROWS)
        throw httpError(413, 'Too many records to verify deletion safely.');
    } while (cursor);
    return records;
  }
  const masterFor = async (inst: InstitutionId, id: string) => {
    checkId(id);
    const master = await get('classes', id);
    const recordType = master?.recordType ?? master?.legacyPayload?.recordType;
    if (!master || master.institutionId !== inst || recordType !== 'class')
      throw httpError(404, 'Class not found in this academy.');
    return master;
  };
  async function teacherIdentity(inst: InstitutionId, claims: Claims) {
    const people = await scan('people');
    const linked = people.filter(
      (row) =>
        row.personTypes?.includes('teacher') &&
        row.status === 'active' &&
        row.institutionIds?.includes(inst) &&
        (row.cognitoSub === claims.sub ||
          row.staffProfile?.cognitoSub === claims.sub ||
          row.legacyPayload?.cognitoSub === claims.sub),
    );
    if (linked.length !== 1)
      throw httpError(403, 'Verified teacher identity required for this academy.');
    // Canonical personId may differ from the TEACHER-... registry ID projected
    // by /teachers and stored on the master class. Both IDs are verified as
    // belonging to this exact Cognito-linked person, never inferred by name.
    return [
      ...new Set(
        [
          linked[0].legacyPayload?.id,
          linked[0].staffProfile?.teacherId,
          linked[0].teacherId,
          linked[0].personId,
        ]
          .filter((id) => typeof id === 'string' && id.length > 0)
          .map(String),
      ),
    ];
  }
  async function assigned(inst: InstitutionId, classId: string, claims: Claims) {
    const master = await masterFor(inst, classId);
    const ids = await teacherIdentity(inst, claims);
    const assignedTeacherKey = ids.find(
      (id) => master.legacyPayload?.teacherId === id || master.teacherPersonIds?.includes(id),
    );
    if (!assignedTeacherKey)
      throw httpError(403, 'Only the assigned teacher can manage sessions for this class.');
    const teacherId = ids.find((id) => /^TEACHER-[0-9a-f-]{36}$/i.test(id)) ?? assignedTeacherKey;
    if (
      master.status === 'archived' ||
      ['archived', 'paused'].includes(
        master.lifecycleStatus ?? master.legacyPayload?.lifecycleStatus,
      )
    )
      throw httpError(409, 'This class is not active.');
    return { master, teacherId, assignedTeacherKey };
  }
  async function ensureNoSessionHistory(inst: InstitutionId, id: string) {
    // Historical attendance, RSVPs, homework and submissions must never become orphans.
    for (const kind of ['attendance', 'rsvps', 'homework', 'submissions'] as const) {
      const all = await scan(kind);
      if (
        all.some(
          (row) =>
            row.institutionId === inst &&
            (row.sessionId === id || row.legacyPayload?.sessionId === id),
        )
      )
        throw httpError(
          409,
          'Session has learning or attendance history. Cancel it instead of permanently deleting it.',
        );
    }
  }
  const toItem = (record: ScheduleRecord, existing?: Record<string, any>, teacherId?: string) => {
    const now = record.updatedAt!;
    const start = record.allDay ? undefined : utcForWallTime(record.date!, record.startTime);
    const end = record.allDay ? undefined : utcForWallTime(record.endDate!, record.endTime);
    const item: Record<string, any> = {
      ...(existing || {}),
      sessionId: record.id,
      institutionId: record.institution,
      recordType: 'class-session',
      classId: record.classId,
      localDate: record.date,
      localEndDate: record.endDate,
      localStartTime: record.startTime,
      localEndTime: record.endTime,
      allDay: record.allDay === true,
      timezone: 'Europe/London',
      status: record.status || 'confirmed',
      teacherPersonIds: existing?.teacherPersonIds ?? (teacherId ? [teacherId] : []),
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: now,
      legacyPayload: {
        ...(existing?.legacyPayload || {}),
        ...record,
        PK: `SCHEDULE#${record.institution}`,
        SK: `RECORD#${record.id}`,
        entityType: 'schedule',
      },
    };
    if (start) item.startAt = start;
    else delete item.startAt;
    if (end) item.endAt = end;
    else delete item.endAt;
    return item;
  };
  async function transact(actions: any[]) {
    try {
      await db.send(new TransactWriteCommand({ TransactItems: actions }));
    } catch (err) {
      invalidChange(err);
    }
  }
  const deleteAction = (
    kind: 'classes' | 'sessions',
    id: string,
    version: number,
    inst: InstitutionId,
  ) => ({
    Delete: {
      TableName: table(kind),
      Key: kind === 'classes' ? { classId: id } : { sessionId: id },
      ConditionExpression: '#v=:v AND #i=:i',
      ExpressionAttributeNames: { '#v': 'version', '#i': 'institutionId' },
      ExpressionAttributeValues: { ':v': version, ':i': inst },
    },
  });
  const auditAction = (inst: InstitutionId, action: string, id: string, sub: string) => ({
    Put: {
      TableName: table('audit'),
      Item: audit(inst, action, id, sub),
      ConditionExpression: 'attribute_not_exists(auditId)',
    },
  });
  return {
    async createAdditionalSessions(
      inst: InstitutionId,
      body: Record<string, any>,
      claims: Claims,
      isAdmin: boolean,
    ) {
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => !['classId', 'sessions'].includes(k))
      )
        throw httpError(400, 'Unexpected additional session fields.');
      if (typeof body.classId !== 'string') throw httpError(400, 'Choose a master class.');
      const master = await masterFor(inst, body.classId);
      const assignment = isAdmin ? null : await assigned(inst, body.classId, claims);
      if (
        ['archived', 'paused'].includes(
          master.lifecycleStatus ?? master.legacyPayload?.lifecycleStatus,
        ) ||
        master.status === 'cancelled'
      )
        throw httpError(409, 'This master class is not active.');
      if (!Array.isArray(body.sessions) || body.sessions.length < 1 || body.sessions.length > 20)
        throw httpError(400, 'Choose 1 to 20 additional sessions.');
      const dateOK = (v: unknown): v is string =>
        typeof v === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v + 'T12:00:00Z')) &&
        new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
      const timeOK = (v: unknown): v is string =>
        typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
      const unique = new Set<string>();
      const template = master.legacyPayload ?? {};
      const now = new Date().toISOString();
      const records: ScheduleRecord[] = body.sessions.map((entry: any) => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          Object.keys(entry).some((k) => !['date', 'startTime', 'endTime'].includes(k))
        )
          throw httpError(400, 'Invalid additional session fields.');
        if (
          !dateOK(entry.date) ||
          !timeOK(entry.startTime) ||
          !timeOK(entry.endTime) ||
          entry.startTime >= entry.endTime
        )
          throw httpError(400, 'Each session needs a valid date and same-day time range.');
        const key = `${entry.date}|${entry.startTime}|${entry.endTime}`;
        if (unique.has(key)) throw httpError(409, 'The proposed sessions contain a duplicate.');
        unique.add(key);
        return validateScheduleRecord({
          id: `EVT-${randomUUID()}`,
          recordType: 'class-session',
          classId: body.classId,
          institution: inst,
          name: template.name ?? master.name ?? '',
          programme: template.programme ?? '',
          teacher: template.teacher ?? '',
          ...(template.teacherId ? { teacherId: template.teacherId } : {}),
          mode: template.mode ?? '',
          location: template.location ?? '',
          date: entry.date,
          endDate: entry.date,
          startTime: entry.startTime,
          endTime: entry.endTime,
          allDay: false,
          timezone: 'Europe/London',
          status: 'confirmed',
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      });
      const all = await scan('sessions');
      if (
        all.some(
          (session) =>
            session.institutionId === inst &&
            session.classId === body.classId &&
            session.recordType === 'class-session' &&
            session.status !== 'cancelled' &&
            records.some(
              (record) =>
                session.localDate === record.date &&
                session.localStartTime === record.startTime &&
                session.localEndTime === record.endTime,
            ),
        )
      )
        throw httpError(
          409,
          'An existing session already has the same date and time for this class. Refresh the calendar.',
        );
      const teacherId = typeof template.teacherId === 'string' ? template.teacherId : undefined;
      const items = records.map((record) => {
        const item = toItem(record, undefined, teacherId);
        return {
          ...item,
          additionalSession: true,
          legacyPayload: { ...item.legacyPayload, additionalSession: true },
        };
      });
      await transact([
        {
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId: body.classId },
            ConditionExpression: assignment
              ? '#v=:v AND #i=:i AND (contains(#teachers,:t) OR #legacy.#tid=:t)'
              : '#v=:v AND #i=:i',
            ExpressionAttributeNames: assignment
              ? {
                  '#v': 'version',
                  '#i': 'institutionId',
                  '#teachers': 'teacherPersonIds',
                  '#legacy': 'legacyPayload',
                  '#tid': 'teacherId',
                }
              : { '#v': 'version', '#i': 'institutionId' },
            ExpressionAttributeValues: assignment
              ? { ':v': master.version, ':i': inst, ':t': assignment.assignedTeacherKey }
              : { ':v': master.version, ':i': inst },
          },
        },
        ...items.map((item) => ({
          Put: {
            TableName: table('sessions'),
            Item: item,
            ConditionExpression: 'attribute_not_exists(sessionId)',
          },
        })),
        auditAction(inst, 'ADDITIONAL_SESSIONS_CREATED', body.classId, String(claims.sub)),
      ]);
      await activity
        .notify({
          institution: inst,
          classIds: [body.classId],
          title: 'Class schedule updated',
          detail: `${records.length} additional class session${records.length === 1 ? '' : 's'} added`,
          category: 'Schedule',
          resourceId: body.classId,
        })
        .catch(() => {});
      return { records, count: records.length };
    },
    async createTeacherSession(inst: InstitutionId, body: Record<string, any>, claims: Claims) {
      if (!body || Array.isArray(body) || Object.keys(body).some((key) => !createFields.has(key)))
        throw httpError(400, 'Unsupported session fields.');
      if (body.recordType !== 'class-session' || !ID.test(body.classId || ''))
        throw httpError(400, 'Choose an assigned master class.');
      const { master, teacherId, assignedTeacherKey } = await assigned(inst, body.classId, claims);
      const template = master.legacyPayload ?? {};
      const now = new Date().toISOString();
      const record = validateScheduleRecord({
        ...body,
        recordType: 'class-session',
        id: `EVT-${randomUUID()}`,
        institution: inst,
        name: body.name ?? template.name ?? '',
        programme: body.programme ?? template.programme ?? '',
        teacher: template.teacher ?? '',
        teacherId,
        mode: body.mode ?? template.mode ?? '',
        location: body.location ?? template.location ?? '',
        allDay: false,
        status: body.status ?? 'confirmed',
        timezone: 'Europe/London',
        version: 1,
        createdAt: now,
        updatedAt: now,
      } as ScheduleRecord);
      const item = toItem(record, undefined, teacherId);
      await transact([
        {
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId: body.classId },
            ConditionExpression:
              '#v=:v AND #i=:i AND (contains(#teachers,:teacher) OR #legacy.#tid=:teacher)',
            ExpressionAttributeNames: {
              '#v': 'version',
              '#i': 'institutionId',
              '#teachers': 'teacherPersonIds',
              '#legacy': 'legacyPayload',
              '#tid': 'teacherId',
            },
            ExpressionAttributeValues: {
              ':v': master.version,
              ':i': inst,
              ':teacher': assignedTeacherKey,
            },
          },
        },
        {
          Put: {
            TableName: table('sessions'),
            Item: item,
            ConditionExpression: 'attribute_not_exists(sessionId)',
          },
        },
        auditAction(inst, 'TEACHER_SESSION_CREATED', record.id, String(claims.sub)),
      ]);
      await activity
        .notify({
          institution: inst,
          classIds: [record.classId!],
          title: 'Class schedule updated',
          detail: `New session · ${record.date} at ${record.startTime}`,
          category: 'Schedule',
          resourceId: record.id,
        })
        .catch(() => {});
      return { record };
    },
    async updateTeacherSession(
      inst: InstitutionId,
      id: string,
      body: Record<string, any>,
      claims: Claims,
    ) {
      checkId(id);
      checkVersion(body?.expectedVersion);
      if (Object.keys(body).some((k) => !writableFields.has(k)))
        throw httpError(400, 'Teachers cannot change a session class or assigned teacher.');
      const current = await get('sessions', id);
      if (!current || current.institutionId !== inst || current.recordType !== 'class-session')
        throw httpError(404, 'Class session not found.');
      const { master, teacherId, assignedTeacherKey } = await assigned(
        inst,
        current.classId,
        claims,
      );
      if (body.expectedVersion !== current.version)
        throw httpError(409, 'Session changed. Refresh before editing.');
      const record = current.legacyPayload as ScheduleRecord;
      if (!record) throw httpError(409, 'Session requires data reconciliation.');
      const updated = scheduleChanges(record, body);
      const now = new Date().toISOString();
      const changed = Object.keys(body).filter(
        (k) =>
          k !== 'expectedVersion' &&
          JSON.stringify((record as any)[k]) !== JSON.stringify((updated as any)[k]),
      );
      const next = {
        ...updated,
        version: current.version + 1,
        updatedAt: now,
        sessionOverrideFields: [...new Set([...(record.sessionOverrideFields || []), ...changed])],
      };
      await transact([
        {
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId: current.classId },
            ConditionExpression: '#v=:v AND (contains(#teachers,:t) OR #legacy.#tid=:t)',
            ExpressionAttributeNames: {
              '#v': 'version',
              '#teachers': 'teacherPersonIds',
              '#legacy': 'legacyPayload',
              '#tid': 'teacherId',
            },
            ExpressionAttributeValues: { ':v': master.version, ':t': assignedTeacherKey },
          },
        },
        {
          Put: {
            TableName: table('sessions'),
            Item: toItem(next, current, teacherId),
            ConditionExpression: '#v=:v AND #i=:i AND #class=:c',
            ExpressionAttributeNames: {
              '#v': 'version',
              '#i': 'institutionId',
              '#class': 'classId',
            },
            ExpressionAttributeValues: { ':v': current.version, ':i': inst, ':c': current.classId },
          },
        },
        auditAction(inst, 'TEACHER_SESSION_UPDATED', id, String(claims.sub)),
      ]);
      await activity
        .notify({
          institution: inst,
          classIds: [current.classId],
          title: 'Class schedule changed',
          detail: `Session updated · ${next.date} at ${next.startTime}`,
          category: 'Schedule',
          resourceId: id,
        })
        .catch(() => {});
      return { record: next };
    },
    async respondToTeacherSession(
      inst: InstitutionId,
      id: string,
      body: Record<string, any>,
      claims: Claims,
    ) {
      checkId(id);
      checkVersion(body?.expectedVersion);
      if (
        Object.keys(body).some((k) => !['response', 'expectedVersion'].includes(k)) ||
        body.response !== 'attending'
      )
        throw httpError(400, 'Invalid teacher response.');
      const current = await get('sessions', id);
      if (!current || current.institutionId !== inst || current.recordType !== 'class-session')
        throw httpError(404, 'Class session not found.');
      const { master, teacherId, assignedTeacherKey } = await assigned(
        inst,
        current.classId,
        claims,
      );
      if (body.expectedVersion !== current.version)
        throw httpError(409, 'Session changed. Refresh before responding.');
      const record = current.legacyPayload as ScheduleRecord;
      if (!record) throw httpError(409, 'Session requires data reconciliation.');
      if (current.status === 'cancelled') throw httpError(409, 'This class session was cancelled.');
      if (Date.parse(utcForWallTime(record.date!, record.startTime)) <= Date.now())
        throw httpError(409, 'Teacher confirmation is only available before the class starts.');
      const now = new Date().toISOString();
      const next = {
        ...record,
        teacherResponse: 'attending' as const,
        version: current.version + 1,
        updatedAt: now,
      };
      await transact([
        {
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId: current.classId },
            ConditionExpression: '#v=:v AND (contains(#teachers,:t) OR #legacy.#tid=:t)',
            ExpressionAttributeNames: {
              '#v': 'version',
              '#teachers': 'teacherPersonIds',
              '#legacy': 'legacyPayload',
              '#tid': 'teacherId',
            },
            ExpressionAttributeValues: { ':v': master.version, ':t': assignedTeacherKey },
          },
        },
        {
          Put: {
            TableName: table('sessions'),
            Item: toItem(next, current, teacherId),
            ConditionExpression: '#v=:v AND #i=:i AND #class=:c AND #status<>:cancelled',
            ExpressionAttributeNames: {
              '#v': 'version',
              '#i': 'institutionId',
              '#class': 'classId',
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':v': current.version,
              ':i': inst,
              ':c': current.classId,
              ':cancelled': 'cancelled',
            },
          },
        },
        auditAction(inst, 'TEACHER_SESSION_ATTENDANCE_CONFIRMED', id, String(claims.sub)),
      ]);
      return { record: next };
    },
    async deleteSession(
      inst: InstitutionId,
      id: string,
      body: Record<string, any>,
      claims: Claims,
      isAdmin: boolean,
    ) {
      checkId(id);
      checkVersion(body?.expectedVersion);
      const session = await get('sessions', id);
      if (!session || session.institutionId !== inst || session.recordType !== 'class-session')
        throw httpError(404, 'Class session not found.');
      if (!isAdmin) await assigned(inst, session.classId, claims);
      if (session.version !== body.expectedVersion)
        throw httpError(409, 'Session changed. Refresh before deletion.');
      await ensureNoSessionHistory(inst, id);
      const actions: any[] = [];
      if (!isAdmin) {
        const { master, assignedTeacherKey } = await assigned(inst, session.classId, claims);
        actions.push({
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId: session.classId },
            ConditionExpression:
              '#v=:v AND #i=:i AND (contains(#teachers,:teacher) OR #legacy.#tid=:teacher)',
            ExpressionAttributeNames: {
              '#v': 'version',
              '#i': 'institutionId',
              '#teachers': 'teacherPersonIds',
              '#legacy': 'legacyPayload',
              '#tid': 'teacherId',
            },
            ExpressionAttributeValues: {
              ':v': master.version,
              ':i': inst,
              ':teacher': assignedTeacherKey,
            },
          },
        });
      }
      actions.push(
        deleteAction('sessions', id, session.version, inst),
        auditAction(inst, 'CLASS_SESSION_DELETED', id, String(claims.sub)),
      );
      await transact(actions);
      await activity
        .notify({
          institution: inst,
          classIds: [session.classId],
          title: 'Class schedule changed',
          detail: `Session cancelled · ${session.localDate || session.legacyPayload?.date || ''}`,
          category: 'Schedule',
          resourceId: id,
        })
        .catch(() => {});
      return { deleted: true, id };
    },
    async previewDeleteClass(inst: InstitutionId, id: string, body: Record<string, any>) {
      checkVersion(body?.expectedVersion);
      const master = await masterFor(inst, id);
      if (master.version !== body.expectedVersion)
        throw httpError(409, 'Class changed. Refresh first.');
      // Any enrolment, even inactive, is history. Archive the master instead of orphaning that history.
      const enrolments = await scan('enrolments');
      if (enrolments.some((e) => e.institutionId === inst && e.classId === id))
        throw httpError(
          409,
          'Class has student enrolment history. Archive it instead of permanently deleting it.',
        );
      const all = await scan('sessions');
      const linked = all.filter((s) => s.institutionId === inst && s.classId === id);
      if (linked.length + 2 > MAX_CLASS_DELETES)
        throw httpError(
          413,
          'Class has too many sessions. Delete sessions in batches before deleting the class.',
        );
      for (const row of linked) {
        if (row.recordType === 'class-session') await ensureNoSessionHistory(inst, row.sessionId);
      }
      const signature = createHash('sha256')
        .update(
          JSON.stringify([
            id,
            master.version,
            ...linked
              .map((s) => [s.sessionId, s.version])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          ]),
        )
        .digest('hex');
      return {
        classId: id,
        name: master.legacyPayload?.name ?? master.name,
        masterVersion: master.version,
        sessionCount: linked.filter((x) => x.recordType === 'class-session').length,
        ruleCount: linked.filter((x) => x.recordType === 'series-change').length,
        dates: linked
          .filter((x) => x.recordType === 'class-session')
          .map((x) => x.localDate)
          .filter(Boolean),
        signature,
      };
    },
    async deleteClass(inst: InstitutionId, id: string, body: Record<string, any>, claims: Claims) {
      if (body?.confirm !== true || typeof body.signature !== 'string')
        throw httpError(400, 'Preview and confirmation required.');
      const preview = await this.previewDeleteClass(inst, id, body);
      if (body.signature !== preview.signature)
        throw httpError(409, 'Deletion preview changed. Refresh and review again.');
      const linked = (await scan('sessions')).filter(
        (x) => x.institutionId === inst && x.classId === id,
      );
      const actualSignature = createHash('sha256')
        .update(
          JSON.stringify([
            id,
            body.expectedVersion,
            ...linked
              .map((s) => [s.sessionId, s.version])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          ]),
        )
        .digest('hex');
      if (actualSignature !== body.signature)
        throw httpError(409, 'Class sessions changed since preview. Review again.');
      const actions = [
        deleteAction('classes', id, body.expectedVersion, inst),
        ...linked.map((s) => deleteAction('sessions', s.sessionId, s.version, inst)),
        auditAction(inst, 'MASTER_CLASS_DELETED', id, String(claims.sub)),
      ];
      if (actions.length > 100) throw httpError(413, 'Too many linked records to delete safely.');
      await transact(actions);
      return {
        deleted: true,
        classId: id,
        sessionCount: preview.sessionCount,
        ruleCount: preview.ruleCount,
      };
    },
    async previewDeleteSeries(inst: InstitutionId, id: string, body: Record<string, any>) {
      checkVersion(body?.expectedVersion);
      const master = await masterFor(inst, id);
      if (master.version !== body.expectedVersion)
        throw httpError(409, 'Class changed. Refresh first.');
      const from = body.effectiveFrom,
        until = body.effectiveUntil;
      if (
        typeof from !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        typeof until !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
        until < from
      )
        throw httpError(400, 'Choose a valid date range.');
      const linked = (await scan('sessions')).filter(
        (x) =>
          x.institutionId === inst &&
          x.classId === id &&
          x.recordType === 'class-session' &&
          x.localDate >= from &&
          x.localDate <= until,
      );
      if (!linked.length) throw httpError(400, 'No stored sessions in this range.');
      if (linked.length > MAX_DELETE_SESSIONS) throw httpError(413, 'Select a smaller date range.');
      for (const row of linked) await ensureNoSessionHistory(inst, row.sessionId);
      const signature = createHash('sha256')
        .update(
          JSON.stringify([
            id,
            master.version,
            ...linked
              .map((s) => [s.sessionId, s.version])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          ]),
        )
        .digest('hex');
      return {
        count: linked.length,
        from,
        until,
        dates: linked.map((x) => ({
          date: x.localDate,
          name: x.legacyPayload?.name ?? '',
          id: x.sessionId,
        })),
        signature,
      };
    },
    async deleteSeries(inst: InstitutionId, id: string, body: Record<string, any>, claims: Claims) {
      if (body?.confirm !== true || typeof body.signature !== 'string')
        throw httpError(400, 'Preview and confirmation required.');
      const preview = await this.previewDeleteSeries(inst, id, body);
      if (preview.signature !== body.signature)
        throw httpError(409, 'Preview changed. Review again.');
      const all = await scan('sessions');
      const selected = all.filter(
        (x) =>
          x.institutionId === inst &&
          x.classId === id &&
          x.recordType === 'class-session' &&
          x.localDate >= preview.from &&
          x.localDate <= preview.until,
      );
      const actualSignature = createHash('sha256')
        .update(
          JSON.stringify([
            id,
            body.expectedVersion,
            ...selected
              .map((s) => [s.sessionId, s.version])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          ]),
        )
        .digest('hex');
      if (actualSignature !== body.signature)
        throw httpError(409, 'Session range changed since preview. Review again.');
      await transact([
        ...selected.map((row) => deleteAction('sessions', row.sessionId, row.version, inst)),
        auditAction(inst, 'CLASS_SESSION_RANGE_DELETED', id, String(claims.sub)),
      ]);
      return { deleted: true, count: preview.count };
    },
  };
}
let singleton: ReturnType<typeof makeM10FinalScheduleSessionAdmin> | undefined;
export function defaultM10FinalScheduleSessionAdmin() {
  if (!singleton)
    singleton = makeM10FinalScheduleSessionAdmin(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
        { marshallOptions: { removeUndefinedValues: true } },
      ),
    );
  return singleton;
}
