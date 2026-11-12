/** M9.3 READ-ONLY transformation preview. Never import into live API without validation. */
import { createHash } from 'node:crypto';
import { M9_SCHEMA_BY_TABLE } from './schema.mjs';
import { wallClockToUtc } from './timezone.mjs';
const digest = (x) => createHash('sha256').update(x).digest('hex');
const copy = (x) => structuredClone(x);
const required = (x) => typeof x === 'string' && x.length > 0;
const asText = (x) => (typeof x === 'string' ? x : null);
const scope = (x) => (x === 'raaga' || x === 'sruti' || x === 'shared' ? x : 'shared');
function convertSchedule(item) {
  if (item.allDay === true) return { startAt: null, endAt: null, timeResolution: 'all-day' };
  const start = wallClockToUtc(item.date, item.startTime, item.timezone ?? 'Europe/London');
  const end = wallClockToUtc(
    item.endDate ?? item.date,
    item.endTime,
    item.timezone ?? 'Europe/London',
  );
  const status =
    start.status === 'converted' && end.status === 'converted'
      ? 'converted'
      : `${start.status}/${end.status}`;
  const validOrder = status !== 'converted' || Date.parse(end.instant) > Date.parse(start.instant);
  return {
    startAt: start.instant,
    endAt: end.instant,
    timeResolution: validOrder ? status : 'invalid-order',
    ...(start.candidates ? { startCandidates: start.candidates } : {}),
    ...(end.candidates ? { endCandidates: end.candidates } : {}),
  };
}
export function transformOne(mapping, source) {
  if (mapping.mergeOnly) return null;
  const id = Object.values(mapping.destinationKey)[0];
  const original = copy(source);
  const common = {
    migrationSource: { table: mapping.source, PK: source.PK, SK: source.SK },
    legacyPayload: original,
    migrationSchema: 1,
  };
  let t;
  switch (mapping.recordType) {
    case 'class':
      t = {
        classId: id,
        institutionId: scope(source.institution),
        name: source.name ?? '',
        description: source.programme ?? '',
        teacherPersonIds: source.teacherId ? [source.teacherId] : [],
        defaultVenueId: source.venueId ?? null,
        location: source.location ?? null,
        status: source.status ?? 'active',
        nameSort: source.name ?? '',
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null,
        version: source.version ?? 1,
      };
      break;
    case 'class-session':
    case 'holiday': {
      t = {
        sessionId: id,
        recordType: mapping.recordType,
        institutionId: scope(source.institution),
        classId: source.classId ?? null,
        venueId: source.venueId ?? null,
        teacherPersonIds: source.teacherId ? [source.teacherId] : [],
        localDate: source.date ?? null,
        localEndDate: source.endDate ?? null,
        localStartTime: source.startTime ?? null,
        localEndTime: source.endTime ?? null,
        timezone: source.timezone ?? 'Europe/London',
        allDay: source.allDay === true,
        status: source.status ?? 'scheduled',
        seriesId: null,
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null,
        version: source.version ?? 1,
        calendarSync: {
          importKey: source.importKey ?? null,
          sourceCalendar: source.sourceCalendar ?? null,
          syncOwner: source.syncOwner ?? null,
          syncVersion: source.syncVersion ?? null,
        },
        sessionOverrideFields: source.sessionOverrideFields ?? null,
        additionalSession: source.additionalSession === true,
      };
      // ISO instants must be derived using a DST-aware time zone conversion later.
      Object.assign(t, convertSchedule(source));
      break;
    }
    case 'series-change':
      t = {
        sessionId: id,
        recordType: 'series-change',
        institutionId: scope(source.institution),
        classId: source.classId,
        seriesId: source.classId,
        effectiveFrom: source.effectiveFrom,
        effectiveUntil: source.effectiveUntil ?? null,
        changes: copy(source.changes),
        updatedAt: source.updatedAt ?? null,
        updatedBy: source.updatedBy ?? null,
      };
      break;
    case 'special-event':
      t = {
        eventId: id,
        institutionId: scope(source.institution),
        title: source.name ?? '',
        eventType: source.eventKind ?? 'other',
        venueId: source.venueId ?? null,
        localDate: source.date ?? null,
        localStartTime: source.startTime ?? null,
        localEndTime: source.endTime ?? null,
        timezone: source.timezone ?? 'Europe/London',
        ...convertSchedule(source),
        managedEvent: source.managedEvent === true,
        status: source.status ?? 'active',
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null,
      };
      break;
    case 'venue':
      t = {
        venueId: id,
        name: source.name ?? '',
        address: source.address ?? null,
        postcode: source.postcode ?? null,
        location: source.location ?? null,
        notes: source.notes ?? null,
        status: source.archived ? 'archived' : 'active',
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null,
      };
      break;
    case 'teacher':
      t = {
        personId: id,
        displayName: source.displayName ?? '',
        personTypes: ['teacher'],
        cognitoSub: source.cognitoSub ?? null,
        institutionIds: source.institutions ?? [],
        status: source.active === false ? 'inactive' : 'active',
        staffProfile: { aliases: source.aliases ?? [], subjects: source.subjects ?? [] },
        createdAt: source.createdAt ?? null,
        updatedAt: source.updatedAt ?? null,
        version: source.version ?? 1,
      };
      break;
    case 'legacy-audit': {
      const institutionId = scope(source.PK.slice(6));
      t = {
        auditId: id,
        institutionId,
        action: asText(source.action) ?? asText(source.type) ?? 'UNKNOWN',
        actorCognitoSub: source.actorSub ?? null,
        actorPersonId: null,
        timestamp: source.at ?? null,
        resourceType: asText(source.resource) ?? null,
        resourceId:
          source.classId ?? source.registrationId ?? source.studentId ?? source.sessionId ?? null,
        legacyAuditId: source.id ?? null,
        schemaVersion: 1,
      };
      break;
    }
    default:
      throw Error(`Unsupported mapping record type: ${mapping.recordType}`);
  }
  return { tableName: mapping.destination, item: { ...t, ...common } };
}
export function previewTransform(tables, plan) {
  const failures = [],
    rows = [],
    byTable = {},
    sourceLookup = new Map();
  for (const [domain, items] of Object.entries(tables))
    for (const x of items) {
      const key = `${domain}\0${x.PK}\0${x.SK}`;
      if (sourceLookup.has(key)) failures.push({ code: 'DUPLICATE_SOURCE_KEY', domain });
      sourceLookup.set(key, x);
    }
  for (const mapping of plan.mappings) {
    if (mapping.mergeOnly) continue;
    const original = sourceLookup.get(
      `${mapping.source}\0${mapping.sourceKey.PK}\0${mapping.sourceKey.SK}`,
    );
    if (!original) {
      failures.push({ code: 'SOURCE_NOT_FOUND', recordType: mapping.recordType });
      continue;
    }
    try {
      const record = transformOne(mapping, original),
        schema = M9_SCHEMA_BY_TABLE.get(record.tableName);
      if (!schema) {
        failures.push({ code: 'UNKNOWN_TARGET_TABLE', table: record.tableName });
        continue;
      }
      if (!required(record.item[schema.partitionKey])) {
        failures.push({ code: 'INVALID_TARGET_PK', table: record.tableName });
        continue;
      }
      const originalHash = digest(JSON.stringify(original));
      if (mapping.sourceHash && mapping.sourceHash !== digest(JSON.stringify(sortDeep(original))))
        failures.push({ code: 'SOURCE_HASH_MISMATCH', table: record.tableName });
      rows.push(record);
      byTable[record.tableName] = (byTable[record.tableName] ?? 0) + 1;
    } catch (e) {
      failures.push({
        code: 'TRANSFORM_FAILED',
        recordType: mapping.recordType,
        reason: e.message,
      });
    }
  }
  const deferred = {
    localTimeConversion: 0,
    missingLocalDates: 0,
    converted: 0,
    allDay: 0,
    ambiguous: 0,
    nonexistent: 0,
    invalid: 0,
    missingTimes: 0,
    invalidOrder: 0,
  };
  for (const { item } of rows)
    if (['class-session', 'holiday'].includes(item.recordType) || item.eventId) {
      if (!item.localDate) deferred.missingLocalDates++;
      if (item.timeResolution === 'converted') deferred.converted++;
      else if (item.timeResolution === 'all-day') deferred.allDay++;
      else if (item.timeResolution) {
        deferred.localTimeConversion++;
        if (item.timeResolution.includes('ambiguous')) deferred.ambiguous++;
        else if (item.timeResolution.includes('nonexistent')) deferred.nonexistent++;
        else if (item.timeResolution.includes('missing')) deferred.missingTimes++;
        else if (item.timeResolution === 'invalid-order') deferred.invalidOrder++;
        else deferred.invalid++;
      }
    }
  return {
    schema: 1,
    readOnly: true,
    canExecute: false,
    sourceTotal: plan.summary.sourceTotal,
    targetItems: rows.length,
    byTable,
    planBlockers: plan.problems.length,
    transformFailures: failures.length,
    failures,
    deferred,
    readyForWrites: false,
    rows,
  };
}
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortDeep(v[k])]),
    );
  return v;
}
