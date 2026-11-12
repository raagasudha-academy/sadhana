import { entityTable } from './entityTables.mjs';
/** M9 calendar pilot writes: isolated from the legacy table router. */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { demandInstitution, httpError } from './model.ts';
import type { Claims } from './model.ts';
import { scheduleChanges, validateScheduleRecord } from './scheduleModel.ts';
import type { ScheduleRecord, ScheduleInstitution } from './scheduleModel.ts';
import { makeLearnerActivityNotifications } from './learnerActivityNotifications.ts';

export type CalendarClient = { send: (cmd: any) => Promise<any> };
const allowedFields = new Set([
  'recordType',
  'name',
  'programme',
  'teacher',
  'mode',
  'location',
  'date',
  'endDate',
  'startTime',
  'endTime',
  'allDay',
  'status',
  'classId',
  'affectsClasses',
]);
const idPattern = /^[-a-zA-Z0-9]{4,90}$/;
const MAX_RENAME_SESSIONS = 98; // 100 DynamoDB transaction actions minus class and audit.
const MAX_SCAN_RECORDS = 6000;
const table = (entity: string) => entityTable(entity);
const primaryKey = (kind: string) =>
  kind === 'class' ? 'classId' : kind === 'special-event' ? 'eventId' : 'sessionId';
const entityFor = (kind: string) =>
  kind === 'class' ? 'classes' : kind === 'special-event' ? 'events' : 'sessions';
function cleanNullIndexes(item: Record<string, unknown>) {
  const copy = { ...item };
  for (const key of [
    'institutionId',
    'classId',
    'seriesId',
    'startAt',
    'endAt',
    'nameSort',
    'organiserPersonId',
  ])
    if (copy[key] === null) delete copy[key];
  return copy;
}
/** Refuse to guess a timestamp at a BST/GMT fold or gap. */
export function utcForWallTime(date: string, time: string): string {
  const ms = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d\d:\d\d$/.test(time))
    throw httpError(400, 'Invalid calendar date or time.');
  const df = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const matches: string[] = [];
  for (const delta of [-60, 0, 60]) {
    const probe = ms + delta * 60000;
    const fields = Object.fromEntries(
      df.formatToParts(new Date(probe)).map((p) => [p.type, p.value]),
    );
    if (
      `${fields.year}-${fields.month}-${fields.day}` === date &&
      `${fields.hour}:${fields.minute}` === time
    )
      matches.push(new Date(probe).toISOString());
  }
  // UK offset is either +00:00 or +01:00. Test both exactly.
  for (const offset of [0, -3600000]) {
    const probe = ms + offset;
    const fields = Object.fromEntries(
      df.formatToParts(new Date(probe)).map((p) => [p.type, p.value]),
    );
    if (
      `${fields.year}-${fields.month}-${fields.day}` === date &&
      `${fields.hour}:${fields.minute}` === time
    )
      matches.push(new Date(probe).toISOString());
  }
  const unique = [...new Set(matches)];
  if (unique.length !== 1)
    throw httpError(
      400,
      unique.length
        ? 'Ambiguous UK daylight-saving time. Choose another time.'
        : 'Nonexistent UK daylight-saving time. Choose another time.',
    );
  return unique[0];
}
function target(record: ScheduleRecord, existing?: Record<string, any>) {
  const base = { ...existing };
  const kind = record.recordType;
  const pk = primaryKey(kind),
    id = record.id;
  if (existing && existing[pk] !== id) throw httpError(409, 'Record identity changed.');
  const original = { ...record };
  const next: Record<string, unknown> = {
    ...base,
    [pk]: id,
    institutionId: record.institution,
    recordType: kind,
    version: record.version,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    legacyPayload: {
      ...(existing?.legacyPayload || {}),
      ...original,
      PK: `SCHEDULE#${record.institution}`,
      SK: `RECORD#${id}`,
      entityType: 'schedule',
    },
  };
  if (kind === 'class') {
    Object.assign(next, {
      name: record.name,
      nameSort: record.name,
      description: record.programme,
      status: record.status || 'active',
      teacherPersonIds: record.teacherId ? [record.teacherId] : [],
      defaultVenueId: existing?.defaultVenueId ?? null,
    });
  } else {
    Object.assign(next, {
      localDate: record.date,
      localEndDate: record.endDate,
      localStartTime: record.startTime,
      localEndTime: record.endTime,
      allDay: record.allDay === true,
      timezone: 'Europe/London',
      classId: record.classId || null,
      status: record.status || 'confirmed',
      teacherPersonIds: record.teacherId ? [record.teacherId] : [],
    });
    if (!record.allDay) {
      next.startAt = utcForWallTime(record.date!, record.startTime);
      next.endAt = utcForWallTime(record.endDate!, record.endTime);
    } else {
      delete next.startAt;
      delete next.endAt;
    }
    if (kind === 'special-event') {
      next.title = record.name;
      next.eventType = 'other';
      next.managedEvent = false;
      delete next.classId;
    }
  }
  return cleanNullIndexes(next);
}
function audit(institution: string, action: string, id: string, actor: string, now: string) {
  return {
    auditId: `m95_${randomUUID()}`,
    institutionId: institution,
    action,
    actorCognitoSub: actor,
    timestamp: now,
    resourceType: 'schedule',
    resourceId: id,
    schemaVersion: 1,
  };
}
function checkPilot() {
  if (process.env.SADHANA_ENTITY_TABLE_SET === 'final') {
    if (
      process.env.SADHANA_FINAL_CALENDAR_WRITES !== 'enabled' ||
      process.env.SADHANA_ENTITY_FINAL_ACK !== 'enabled' ||
      process.env.SADHANA_DATA_MODE === 'split'
    )
      throw httpError(503, 'Final calendar writes are disabled.');
    return;
  }
  if (process.env.M95_COMPAT_MODE !== 'pilot' || process.env.M95_CALENDAR_WRITES !== 'enabled')
    throw httpError(503, 'M9 calendar write pilot is disabled.');
}
export function makeM95CalendarWriter(client: CalendarClient) {
  const activity = makeLearnerActivityNotifications(client);
  const notifyClassSchedule = async (
    inst: 'raaga' | 'sruti',
    classId: string,
    title: string,
    detail: string,
    resourceId: string,
  ) => {
    if (process.env.SADHANA_ENTITY_TABLE_SET === 'final')
      await activity
        .notify({
          institution: inst,
          classIds: [classId],
          title,
          detail,
          category: 'Schedule',
          resourceId,
        })
        .catch(() => {});
  };
  const get = async (entity: 'classes' | 'sessions', id: string) => {
    const pk = entity === 'classes' ? 'classId' : 'sessionId';
    const result = await client.send(
      new GetCommand({ TableName: table(entity), Key: { [pk]: id }, ConsistentRead: true }),
    );
    return result.Item as Record<string, any> | undefined;
  };
  const transact = async (
    entity: 'classes' | 'sessions',
    item: Record<string, unknown>,
    previousVersion: number | undefined,
    actor: string,
    action: string,
  ) => {
    const pk = entity === 'classes' ? 'classId' : 'sessionId';
    const now = String(item.updatedAt);
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: table(entity),
                Item: item,
                ConditionExpression:
                  previousVersion === undefined
                    ? 'attribute_not_exists(#pk)'
                    : '#version = :old AND #inst = :inst',
                ExpressionAttributeNames:
                  previousVersion === undefined
                    ? { '#pk': pk }
                    : { '#version': 'version', '#inst': 'institutionId' },
                ...(previousVersion === undefined
                  ? {}
                  : {
                      ExpressionAttributeValues: {
                        ':old': previousVersion,
                        ':inst': item.institutionId,
                      },
                    }),
              },
            },
            {
              Put: {
                TableName: table('audit'),
                Item: audit(String(item.institutionId), action, String(item[pk]), actor, now),
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (
        ['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(
          (e as Error)?.name,
        )
      )
        throw httpError(409, 'Record changed or already exists. Refresh and retry.');
      throw e;
    }
  };
  const rename = async (
    inst: 'raaga' | 'sruti',
    stored: Record<string, any>,
    current: ScheduleRecord,
    next: ScheduleRecord,
    actor: string,
  ) => {
    const records: Record<string, any>[] = [];
    let cursor: Record<string, any> | undefined;
    do {
      const result = await client.send(
        new ScanCommand({
          TableName: table('sessions'),
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
          Limit: 250,
        }),
      );
      records.push(...(result.Items ?? []));
      cursor = result.LastEvaluatedKey;
      if (records.length > MAX_SCAN_RECORDS)
        throw httpError(413, 'Too many sessions to verify class rename safely.');
    } while (cursor);
    // A session with a deliberate one-off name override must not be renamed.
    const linked = records.filter(
      (x) =>
        x.institutionId === inst && x.classId === current.id && x.recordType === 'class-session',
    );
    const toRename = linked.filter(
      (x) =>
        !x.legacyPayload?.sessionOverrideFields?.includes('name') &&
        x.legacyPayload?.name === current.name,
    );
    if (toRename.length > MAX_RENAME_SESSIONS)
      throw httpError(
        409,
        'Class has too many linked sessions for one atomic rename; no records changed.',
      );
    if (linked.some((x) => !x.legacyPayload || !Number.isInteger(x.version) || !x.sessionId))
      throw httpError(409, 'Some linked sessions cannot be safely renamed.');
    // Effective-dated rules can themselves rename sessions. Refuse to overwrite that intent.
    if (
      records.some(
        (x) =>
          x.institutionId === inst &&
          x.classId === current.id &&
          x.recordType === 'series-change' &&
          x.legacyPayload?.changes?.name !== undefined,
      )
    )
      throw httpError(409, 'Class has effective-dated name changes; review those before renaming.');
    const now = new Date().toISOString();
    const newMaster = { ...next, version: current.version! + 1, updatedAt: now };
    const writes: any[] = [
      {
        Put: {
          TableName: table('classes'),
          Item: target(newMaster, stored),
          ConditionExpression: '#v=:old AND #inst=:inst',
          ExpressionAttributeNames: { '#v': 'version', '#inst': 'institutionId' },
          ExpressionAttributeValues: { ':old': current.version, ':inst': inst },
        },
      },
    ];
    for (const row of toRename) {
      const previous = row.legacyPayload as ScheduleRecord;
      const revised = { ...previous, name: next.name, version: row.version + 1, updatedAt: now };
      validateScheduleRecord(revised);
      const item = {
        ...row,
        version: revised.version,
        updatedAt: now,
        legacyPayload: {
          ...row.legacyPayload,
          name: next.name,
          version: revised.version,
          updatedAt: now,
        },
      };
      writes.push({
        Put: {
          TableName: table('sessions'),
          Item: item,
          ConditionExpression: '#v=:old AND #inst=:inst AND #class=:class',
          ExpressionAttributeNames: {
            '#v': 'version',
            '#inst': 'institutionId',
            '#class': 'classId',
          },
          ExpressionAttributeValues: { ':old': row.version, ':inst': inst, ':class': current.id },
        },
      });
    }
    writes.push({
      Put: {
        TableName: table('audit'),
        Item: {
          ...audit(inst, 'M95_RENAME_CLASS', current.id, actor, now),
          previousName: current.name,
          newName: next.name,
          renamedSessions: toRename.length,
          preservedOverrides: linked.length - toRename.length,
        },
        ConditionExpression: 'attribute_not_exists(auditId)',
      },
    });
    try {
      await client.send(new TransactWriteCommand({ TransactItems: writes }));
    } catch (e) {
      if (
        ['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(
          (e as Error)?.name,
        )
      )
        throw httpError(409, 'Class or sessions changed. Refresh and retry.');
      throw e;
    }
    await notifyClassSchedule(
      inst,
      current.id,
      'Class schedule changed',
      `Class renamed · ${next.name}`,
      current.id,
    );
    return {
      record: newMaster,
      renamedSessions: toRename.length,
      preservedOverrides: linked.length - toRename.length,
    };
  };
  return {
    async create(inst: ScheduleInstitution, raw: Record<string, any>, claims: Claims) {
      checkPilot();
      if (inst === 'shared')
        throw httpError(501, 'Shared calendar writes are not yet enabled for M9.');
      demandInstitution(claims, inst);
      if (
        !raw ||
        Array.isArray(raw) ||
        typeof raw !== 'object' ||
        Object.keys(raw).some((k) => !allowedFields.has(k))
      )
        throw httpError(400, 'Unexpected schedule fields.');
      if (!['class', 'class-session'].includes(raw.recordType))
        throw httpError(501, 'This record type is not yet enabled for M9 writes.');
      const now = new Date().toISOString();
      const record = validateScheduleRecord({
        ...raw,
        id: `EVT-${randomUUID()}`,
        institution: inst,
        timezone: 'Europe/London',
        version: 1,
        createdAt: now,
        updatedAt: now,
      } as ScheduleRecord);
      if (record.recordType === 'class-session') {
        const master = await get('classes', record.classId!);
        if (!master || master.institutionId !== inst)
          throw httpError(400, 'Session must belong to a class in this institution.');
      }
      const entity = entityFor(record.recordType) as 'classes' | 'sessions';
      await transact(entity, target(record), undefined, String(claims.sub), 'M95_CREATE_SCHEDULE');
      if (record.recordType === 'class-session')
        await notifyClassSchedule(
          inst,
          record.classId!,
          'Class schedule updated',
          `New session · ${record.date} at ${record.startTime}`,
          record.id,
        );
      return { record };
    },
    async patch(inst: ScheduleInstitution, id: string, raw: Record<string, any>, claims: Claims) {
      checkPilot();
      if (inst === 'shared')
        throw httpError(501, 'Shared calendar writes are not yet enabled for M9.');
      demandInstitution(claims, inst);
      if (!idPattern.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw))
        throw httpError(400, 'Invalid schedule update.');
      const matches = await Promise.all([get('classes', id), get('sessions', id)]);
      if (matches.filter(Boolean).length > 1) throw httpError(409, 'Duplicate schedule identity.');
      const stored = matches.find(Boolean);
      if (!stored || stored.institutionId !== inst)
        throw httpError(404, 'Schedule entry not found.');
      if (!['class', 'class-session'].includes(stored.legacyPayload?.recordType))
        throw httpError(501, 'This record type is not yet enabled for M9 writes.');
      const current = stored.legacyPayload as ScheduleRecord;
      if (
        !Number.isInteger(raw.expectedVersion) ||
        raw.expectedVersion !== stored.version ||
        raw.expectedVersion !== current.version
      )
        throw httpError(409, 'Record changed. Refresh before editing.');
      const updated = scheduleChanges(current, raw);
      if (current.recordType === 'class' && updated.name !== current.name) {
        if (typeof raw.name !== 'string' || !raw.name.trim())
          throw httpError(400, 'Valid class name required.');
        if (Object.keys(raw).some((key) => !['name', 'expectedVersion'].includes(key)))
          throw httpError(400, 'Rename separately from other class changes.');
        return rename(inst as 'raaga' | 'sruti', stored, current, updated, String(claims.sub));
      }
      if (updated.teacherId !== current.teacherId)
        throw httpError(501, 'Teacher identity changes require M9 teacher verification.');
      const now = new Date().toISOString();
      const next = { ...updated, version: current.version! + 1, updatedAt: now };
      if (current.recordType === 'class-session') {
        const changed = Object.keys(raw).filter(
          (k) =>
            k !== 'expectedVersion' &&
            JSON.stringify((current as any)[k]) !== JSON.stringify((updated as any)[k]),
        );
        next.sessionOverrideFields = [
          ...new Set([...(current.sessionOverrideFields || []), ...changed]),
        ];
      }
      await transact(
        current.recordType === 'class' ? 'classes' : 'sessions',
        target(next, stored),
        stored.version,
        String(claims.sub),
        'M95_UPDATE_SCHEDULE',
      );
      if (current.recordType === 'class-session')
        await notifyClassSchedule(
          inst,
          current.classId!,
          'Class schedule changed',
          `Session updated · ${next.date} at ${next.startTime}`,
          id,
        );
      else
        await notifyClassSchedule(
          inst,
          current.id,
          'Class schedule changed',
          `Class timetable updated · ${next.name}`,
          id,
        );
      return { record: next, renamedSessions: 0, preservedOverrides: 0 };
    },
  };
}
export function defaultM95CalendarWriter() {
  return makeM95CalendarWriter(
    DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      { marshallOptions: { removeUndefinedValues: true } },
    ),
  );
}
