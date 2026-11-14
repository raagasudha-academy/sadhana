#!/usr/bin/env node
/** One-time, additive copy of approved Sadhana dev reference data into prod.
 * Reads canonical dev-sadhana tables only. Never reads learner/family/registration
 * tables, never copies Cognito subjects, and never overwrites or deletes prod rows.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  DynamoDBClient,
  DescribeContinuousBackupsCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const ACCOUNT = '627821644317';
const ACK = 'COPY_SELECTED_DEV_DATA_TO_PROD';
const INSTITUTIONS = new Set(['raaga', 'sruti', 'shared']);
const TABLES = Object.freeze({
  classes: { source: 'dev-sadhana-classes', target: 'prod-sadhana-classes', key: 'classId' },
  sessions: { source: 'dev-sadhana-sessions', target: 'prod-sadhana-sessions', key: 'sessionId' },
  venues: { source: 'dev-sadhana-venues', target: 'prod-sadhana-venues', key: 'venueId' },
  events: { source: 'dev-sadhana-events', target: 'prod-sadhana-events', key: 'eventId' },
  people: { source: 'dev-sadhana-people', target: 'prod-sadhana-people', key: 'personId' },
});
const ALL_PROD_ENTITY_TABLES = Object.freeze([
  'prod-sadhana-institutions',
  'prod-sadhana-families',
  'prod-sadhana-family-links',
  'prod-sadhana-enrolments',
  'prod-sadhana-attendance',
  'prod-sadhana-practice',
  'prod-sadhana-homework',
  'prod-sadhana-submissions',
  'prod-sadhana-rsvps',
  'prod-sadhana-registrations',
  'prod-sadhana-notifications',
  'prod-sadhana-audit-records',
  'prod-sadhana-counters',
]);
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value instanceof Set
      ? [...value].map(stable).sort()
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])]),
          )
        : value;
const json = (value) => JSON.stringify(stable(value));
const sha = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : json(value))
    .digest('hex');
const fail = (message) => {
  throw new Error(`STOP: ${message}`);
};

function parseArgs(argv) {
  const args = new Set(argv);
  if (args.has('--help')) {
    console.log(
      'Plan: AWS_PROFILE=raagasudha AWS_REGION=us-east-1 node scripts/copySelectedDevDataToProd.mjs --plan\nApply: ... --apply --confirm COPY_SELECTED_DEV_DATA_TO_PROD --expected-fingerprint <plan fingerprint>',
    );
    process.exit(0);
  }
  const plan = args.has('--plan');
  const apply = args.has('--apply');
  if (plan === apply) fail('Choose exactly one of --plan or --apply.');
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index < 0 ? '' : argv[index + 1] || '';
  };
  for (const arg of argv)
    if (
      !['--plan', '--apply', '--confirm', '--expected-fingerprint'].includes(arg) &&
      !argv[argv.indexOf(arg) - 1]?.startsWith('--')
    )
      fail(`Unexpected argument ${arg}.`);
  const confirm = value('--confirm');
  const fingerprint = value('--expected-fingerprint');
  if (plan && (confirm || fingerprint)) fail('Plan mode does not accept write acknowledgements.');
  if (apply && (confirm !== ACK || !/^[a-f0-9]{64}$/.test(fingerprint)))
    fail(`Apply requires --confirm ${ACK} and the reviewed plan fingerprint.`);
  return { mode: apply ? 'apply' : 'plan', expectedFingerprint: fingerprint };
}

async function scan(table, options = {}) {
  const rows = [];
  let cursor;
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: table,
        ConsistentRead: true,
        ExclusiveStartKey: cursor,
        ...options,
      }),
    );
    rows.push(...(page.Items || []));
    cursor = page.LastEvaluatedKey;
    if (rows.length > 30000) fail(`${table} exceeded the 30000-row safety limit.`);
  } while (cursor);
  return rows;
}

const refsIn = (row) => {
  const refs = [
    ...(Array.isArray(row.teacherPersonIds) ? row.teacherPersonIds : []),
    row.teacherPersonId,
    row.teacherId,
    row.legacyPayload?.teacherId,
    row.changes?.teacherId,
    row.legacyPayload?.changes?.teacherId,
  ];
  return [...new Set(refs.filter((value) => typeof value === 'string' && value))];
};
const sourceTeacherName = (row, id) => {
  if (row.teacherId === id || row.legacyPayload?.teacherId === id)
    return row.legacyPayload?.teacher || row.teacher || '';
  if (row.changes?.teacherId === id || row.legacyPayload?.changes?.teacherId === id)
    return row.changes?.teacher || row.legacyPayload?.changes?.teacher || '';
  if (row.teacherPersonId === id || row.teacherPersonIds?.includes(id))
    return row.legacyPayload?.teacher || row.teacher || '';
  return '';
};
const normalizedName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKC');

// Keep only calendar fields required by the existing API contract. This projection
// deliberately excludes DynamoDB keys, Cognito subjects, email, and import metadata.
const CALENDAR_FIELDS = [
  'id',
  'recordType',
  'institution',
  'name',
  'programme',
  'teacher',
  'teacherId',
  'mode',
  'location',
  'date',
  'endDate',
  'startTime',
  'endTime',
  'timezone',
  'status',
  'classId',
  'sessionOverrideFields',
  'affectsClasses',
  'managedEvent',
  'sharedEvent',
  'effectiveFrom',
  'effectiveUntil',
  'changes',
  'eventKind',
  'version',
  'createdAt',
  'updatedAt',
];
function calendarProjection(row) {
  const source = row.legacyPayload;
  if (!source || typeof source !== 'object' || Array.isArray(source))
    fail(`Selected ${row.recordType || 'calendar'} row has no source calendar fields.`);
  const record = Object.fromEntries(
    CALENDAR_FIELDS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
  if (
    (record.recordType ?? row.recordType) !== 'series-change' &&
    (typeof record.id !== 'string' || !record.id)
  )
    fail(
      `Selected ${row.sessionId || row.classId || row.eventId || 'calendar'} projection (${record.recordType || row.recordType || 'unknown type'}) is missing its public ID.`,
    );
  return record;
}
function venueProjection(row) {
  const source = row.legacyPayload;
  if (!source || typeof source !== 'object' || Array.isArray(source))
    fail('Selected venue row has no source directory fields.');
  const record = Object.fromEntries(
    ['id', 'name', 'address', 'postcode', 'location', 'archived', 'version']
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  if (typeof record.id !== 'string' || !record.id || typeof record.name !== 'string')
    fail('Selected venue projection is missing its public ID or name.');
  return record;
}

function minimalTeacher(source, id = source.personId, fallback = {}) {
  const displayName = normalizedName(
    source.displayName || source.legacyPayload?.displayName || fallback.displayName,
  );
  if (!displayName) fail('A referenced teacher has no source display name.');
  const institutions = [
    ...new Set(
      (
        source.institutionIds ||
        source.legacyPayload?.institutions ||
        fallback.institutions ||
        []
      ).filter((value) => value === 'raaga' || value === 'sruti'),
    ),
  ];
  const subjects = [
    ...new Set(
      (source.staffProfile?.subjects || source.legacyPayload?.subjects || [])
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim()),
    ),
  ];
  const aliases = [
    ...new Set(
      (source.staffProfile?.aliases || source.legacyPayload?.aliases || [])
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim()),
    ),
  ];
  const status =
    source.status ||
    (source.legacyPayload?.active === false ? 'inactive' : fallback.status || 'active');
  const createdAt = source.createdAt || source.legacyPayload?.createdAt || fallback.createdAt;
  const updatedAt = source.updatedAt || source.legacyPayload?.updatedAt || fallback.updatedAt;
  const version = Number.isSafeInteger(source.version) ? source.version : 1;
  const legacyPayload = {
    id,
    displayName,
    institutions,
    subjects,
    aliases,
    active: status === 'active',
    version,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
  return {
    personId: id,
    displayName,
    personTypes: ['teacher'],
    directoryGroup: 'teacher',
    displayNameSort: displayName.toLocaleLowerCase('en-GB'),
    institutionIds: institutions,
    status,
    staffProfile: { teacherId: id, subjects, aliases },
    legacyPayload,
    version,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function selectedRows(source) {
  const classes = source.classes.filter(
    (row) => row.institutionId === 'raaga' || row.institutionId === 'sruti',
  );
  const sessions = source.sessions.filter((row) => INSTITUTIONS.has(row.institutionId));
  const venues = source.venues;
  const events = source.events.filter(
    (row) => row.institutionId === 'shared' || row.sharedEvent === true,
  );
  const allowedReferences = new Set([...classes, ...sessions, ...events].flatMap(refsIn));
  const teacherSource = source.people.filter(
    (row) => row.personTypes?.includes('teacher') && allowedReferences.has(row.personId),
  );
  const teachers = new Map(teacherSource.map((row) => [row.personId, minimalTeacher(row)]));
  const missing = [...allowedReferences].filter((id) => !teachers.has(id));
  const unresolved = [];
  for (const id of missing) {
    const matches = [...classes, ...sessions, ...events]
      .map((row) => sourceTeacherName(row, id))
      .map(normalizedName)
      .filter(Boolean);
    const distinct = [
      ...new Map(matches.map((name) => [name.toLocaleLowerCase('en-GB'), name])).values(),
    ];
    if (distinct.length !== 1) {
      unresolved.push(id);
      continue;
    }
    const institutions = [
      ...new Set(
        [...classes, ...sessions, ...events]
          .filter((row) => refsIn(row).includes(id))
          .map((row) => row.institutionId)
          .filter((value) => value === 'raaga' || value === 'sruti'),
      ),
    ];
    teachers.set(
      id,
      minimalTeacher({}, id, { displayName: distinct[0], institutions, status: 'active' }),
    );
  }
  if (unresolved.length)
    fail(
      `${unresolved.length} selected teacher references cannot be resolved to one consistent name.`,
    );

  const output = {
    classes: classes.map((row) => ({
      classId: row.classId,
      institutionId: row.institutionId,
      name: row.name,
      description: row.description,
      teacherPersonIds: row.teacherPersonIds || [],
      defaultVenueId: row.defaultVenueId,
      location: row.location,
      status: row.status,
      nameSort: row.nameSort,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
      calendarRecord: calendarProjection(row),
    })),
    sessions: sessions.map((row) => ({
      sessionId: row.sessionId,
      recordType: row.recordType,
      institutionId: row.institutionId,
      classId: row.classId,
      venueId: row.venueId,
      teacherPersonIds: row.teacherPersonIds || [],
      localDate: row.localDate,
      localEndDate: row.localEndDate,
      localStartTime: row.localStartTime,
      localEndTime: row.localEndTime,
      timezone: row.timezone,
      allDay: row.allDay,
      startAt: row.startAt,
      endAt: row.endAt,
      status: row.status,
      seriesId: row.seriesId,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil,
      changes: row.changes,
      sessionOverrideFields: row.sessionOverrideFields,
      additionalSession: row.additionalSession,
      timeResolution: row.timeResolution,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
      calendarRecord: calendarProjection(row),
    })),
    venues: venues.map((row) => ({
      venueId: row.venueId,
      name: row.name,
      address: row.address,
      postcode: row.postcode,
      location: row.location,
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      calendarRecord: venueProjection(row),
    })),
    events: events.map((row) => ({
      eventId: row.eventId,
      institutionId: row.institutionId,
      title: row.title,
      eventType: row.eventType,
      venueId: row.venueId,
      localDate: row.localDate,
      localStartTime: row.localStartTime,
      localEndTime: row.localEndTime,
      timezone: row.timezone,
      startAt: row.startAt,
      endAt: row.endAt,
      timeResolution: row.timeResolution,
      managedEvent: row.managedEvent,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
      calendarRecord: calendarProjection(row),
    })),
    people: [...teachers.values()],
  };
  for (const [domain, rows] of Object.entries(output))
    for (const row of rows)
      for (const [key, value] of Object.entries(row)) if (value === undefined) delete row[key];

  const classIds = new Set(output.classes.map((row) => row.classId));
  const venueIds = new Set(output.venues.map((row) => row.venueId));
  const teacherIds = new Set(output.people.map((row) => row.personId));
  const broken = { classes: 0, venues: 0, teachers: 0 };
  for (const row of output.classes) {
    if (row.defaultVenueId && !venueIds.has(row.defaultVenueId)) broken.venues++;
    if ((row.teacherPersonIds || []).some((id) => !teacherIds.has(id))) broken.teachers++;
  }
  for (const row of output.sessions) {
    if (row.recordType === 'class-session' || row.recordType === 'series-change')
      if (row.classId && !classIds.has(row.classId)) broken.classes++;
    if (row.venueId && !venueIds.has(row.venueId)) broken.venues++;
    if ((row.teacherPersonIds || []).some((id) => !teacherIds.has(id))) broken.teachers++;
  }
  for (const row of output.events) if (row.venueId && !venueIds.has(row.venueId)) broken.venues++;
  if (Object.values(broken).some(Boolean))
    fail(
      `Selected records have broken class/venue/teacher references (${JSON.stringify(broken)}).`,
    );
  const loginFields = new Set(['cognitoSub', 'cognitoUserId', 'actorCognitoSub', 'userPoolId']);
  const containsLoginField = (value) =>
    Array.isArray(value)
      ? value.some(containsLoginField)
      : value && typeof value === 'object'
        ? Object.entries(value).some(
            ([key, child]) => loginFields.has(key) || containsLoginField(child),
          )
        : false;
  if (Object.values(output).flat().some(containsLoginField))
    fail('A selected production item still contains a development login field.');
  return { output, fallbackTeacherProfiles: missing.length };
}

async function describe(tableName) {
  const table = (await client.send(new DescribeTableCommand({ TableName: tableName }))).Table;
  const backup = await client.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));
  return {
    table,
    pitr: backup.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
      ?.PointInTimeRecoveryStatus,
  };
}
const keyName = (entity) => TABLES[entity].key;
function schemaShape(table) {
  return {
    keys: (table.KeySchema || []).map((item) => `${item.KeyType}:${item.AttributeName}`).sort(),
    indexes: (table.GlobalSecondaryIndexes || [])
      .map(
        (index) =>
          `${index.IndexName}:${index.KeySchema.map(
            (item) => `${item.KeyType}:${item.AttributeName}`,
          )
            .sort()
            .join(',')}`,
      )
      .sort(),
  };
}
const withoutCalendarRecord = (row) => {
  const { calendarRecord, ...rest } = row;
  return rest;
};

async function buildPlan() {
  if (!process.env.AWS_PROFILE || process.env.AWS_REGION !== REGION)
    fail('Set AWS_PROFILE and AWS_REGION=us-east-1 explicitly.');
  const account = execFileSync(
    'aws',
    ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', REGION],
    { encoding: 'utf8', env: process.env },
  ).trim();
  if (account !== ACCOUNT) fail('AWS account mismatch.');
  const source = {};
  for (const domain of ['classes', 'sessions', 'venues', 'events'])
    source[domain] = await scan(TABLES[domain].source);
  // Fetch only teacher profiles and an allowlist of their non-login attributes.
  source.people = await scan(TABLES.people.source, {
    FilterExpression: 'contains(#personTypes,:teacher)',
    ExpressionAttributeNames: {
      '#personTypes': 'personTypes',
      '#personId': 'personId',
      '#displayName': 'displayName',
      '#directoryGroup': 'directoryGroup',
      '#displayNameSort': 'displayNameSort',
      '#institutionIds': 'institutionIds',
      '#status': 'status',
      '#staffProfile': 'staffProfile',
      '#subjects': 'subjects',
      '#aliases': 'aliases',
      '#teacherId': 'teacherId',
      '#legacyPayload': 'legacyPayload',
      '#id': 'id',
      '#institutions': 'institutions',
      '#active': 'active',
      '#version': 'version',
      '#createdAt': 'createdAt',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: { ':teacher': 'teacher' },
    ProjectionExpression:
      '#personId,#displayName,#personTypes,#directoryGroup,#displayNameSort,#institutionIds,#status,#staffProfile.#teacherId,#staffProfile.#subjects,#staffProfile.#aliases,#legacyPayload.#id,#legacyPayload.#displayName,#legacyPayload.#institutions,#legacyPayload.#subjects,#legacyPayload.#aliases,#legacyPayload.#active,#legacyPayload.#version,#legacyPayload.#createdAt,#legacyPayload.#updatedAt,#version,#createdAt,#updatedAt',
  });
  const selected = selectedRows(source);
  const records = Object.entries(selected.output)
    .flatMap(([entity, rows]) =>
      rows.map((item) => ({ table: entity, key: item[keyName(entity)], item })),
    )
    .sort((a, b) => `${a.table}\0${a.key}`.localeCompare(`${b.table}\0${b.key}`));
  if (records.some((row) => typeof row.key !== 'string' || !row.key))
    fail('Selected item is missing its destination key.');
  const fingerprint = sha(records.map((row) => [row.table, row.key, sha(row.item)]));
  return {
    identity: { Account: account },
    selected: selected.output,
    records,
    summary: {
      readOnly: true,
      account,
      source: 'canonical dev-sadhana tables',
      destination: 'prod-sadhana tables',
      recordCounts: Object.fromEntries(
        Object.entries(selected.output).map(([table, rows]) => [table, rows.length]),
      ),
      teacherProfilesCopiedWithoutDevLoginLinks: selected.output.people.length,
      devLoginLinksCopied: 0,
      referenceOnlyTeacherProfilesAdded: selected.fallbackTeacherProfiles,
      institutionalEventsExcluded: source.events.length - selected.output.events.length,
      studentsFamiliesEnrolmentsRegistrationsAndLearningCopied: 0,
      fingerprint,
    },
  };
}

async function targetPlan(plan) {
  const targets = {};
  for (const entity of Object.keys(TABLES)) {
    const sourceInfo = await describe(TABLES[entity].source);
    const targetInfo = await describe(TABLES[entity].target);
    if (sourceInfo.table.TableStatus !== 'ACTIVE' || targetInfo.table.TableStatus !== 'ACTIVE')
      fail(`${entity} source/target is not ACTIVE.`);
    if (sourceInfo.pitr !== 'ENABLED' || sourceInfo.table.DeletionProtectionEnabled !== true)
      fail(`${entity} source is not protected by PITR and deletion protection.`);
    if (targetInfo.pitr !== 'ENABLED' || targetInfo.table.DeletionProtectionEnabled !== true)
      fail(`${entity} prod target is not protected by PITR and deletion protection.`);
    if (
      JSON.stringify(schemaShape(sourceInfo.table)) !==
      JSON.stringify(schemaShape(targetInfo.table))
    )
      fail(`${entity} source and prod target schemas differ.`);
    const existing = await scan(TABLES[entity].target);
    const key = TABLES[entity].key;
    const selectedByKey = new Map(plan.selected[entity].map((item) => [item[key], item]));
    const needsProjection = new Set();
    for (const row of existing) {
      const expected = selectedByKey.get(row[key]);
      if (!expected || json(row) === json(expected)) continue;
      if (
        expected.calendarRecord &&
        row.calendarRecord === undefined &&
        json(withoutCalendarRecord(row)) === json(withoutCalendarRecord(expected))
      ) {
        needsProjection.add(row[key]);
        continue;
      }
      fail(`${entity} prod target has a conflicting selected key; no records were written.`);
    }
    targets[entity] = { existing: new Set(existing.map((row) => row[key])), needsProjection };
  }
  for (const tableName of ALL_PROD_ENTITY_TABLES) {
    const { table, pitr } = await describe(tableName);
    if (
      table.TableStatus !== 'ACTIVE' ||
      table.DeletionProtectionEnabled !== true ||
      pitr !== 'ENABLED'
    )
      fail(`${tableName} is not ACTIVE with deletion protection and PITR.`);
  }
  const srutiSource = await describe('prod-sruti-student-registrations');
  if (
    srutiSource.table.TableStatus !== 'ACTIVE' ||
    srutiSource.table.DeletionProtectionEnabled !== true ||
    srutiSource.pitr !== 'ENABLED'
  )
    fail('Prod Sruti source table is not ACTIVE with deletion protection and PITR.');
  return targets;
}

async function applyPlan(plan, targets) {
  let projectionsAdded = 0;
  for (const entity of Object.keys(TABLES)) {
    const { target, key } = TABLES[entity];
    for (const item of plan.selected[entity]) {
      if (targets[entity].needsProjection.has(item[key])) {
        await client.send(
          new UpdateCommand({
            TableName: target,
            Key: { [key]: item[key] },
            UpdateExpression: 'SET #calendarRecord = :calendarRecord',
            ConditionExpression: 'attribute_not_exists(#calendarRecord)',
            ExpressionAttributeNames: { '#calendarRecord': 'calendarRecord' },
            ExpressionAttributeValues: { ':calendarRecord': item.calendarRecord },
          }),
        );
        projectionsAdded++;
        continue;
      }
      if (targets[entity].existing.has(item[key])) continue;
      try {
        await client.send(
          new PutCommand({
            TableName: target,
            Item: item,
            ConditionExpression: 'attribute_not_exists(#pk)',
            ExpressionAttributeNames: { '#pk': key },
          }),
        );
      } catch (error) {
        if (error?.name !== 'ConditionalCheckFailedException') throw error;
        const current = (
          await client.send(
            new GetCommand({ TableName: target, Key: { [key]: item[key] }, ConsistentRead: true }),
          )
        ).Item;
        if (!current || json(current) !== json(item))
          fail(`${entity} ${sha(item[key]).slice(0, 12)} collided with a different prod item.`);
      }
    }
  }
  for (const entity of Object.keys(TABLES)) {
    const expected = new Map(plan.selected[entity].map((item) => [item[TABLES[entity].key], item]));
    const actual = await scan(TABLES[entity].target);
    const actualByKey = new Map(actual.map((row) => [row[TABLES[entity].key], row]));
    for (const [key, row] of expected)
      if (json(actualByKey.get(key)) !== json(row)) fail(`${entity} prod verification failed.`);
  }
  return projectionsAdded;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const plan = await buildPlan();
  if (args.mode === 'plan') {
    console.log(JSON.stringify(plan.summary, null, 2));
    process.exitCode = 0;
  } else {
    if (plan.summary.fingerprint !== args.expectedFingerprint)
      fail('Source data differs from the reviewed fingerprint; run --plan again.');
    const targets = await targetPlan(plan);
    console.log(
      JSON.stringify(
        {
          ...plan.summary,
          readOnly: false,
          targetPreflight: 'passed',
          selectedRowsNeedingCalendarProjection: Object.values(targets).reduce(
            (sum, target) => sum + target.needsProjection.size,
            0,
          ),
        },
        null,
        2,
      ),
    );
    const projectionsAdded = await applyPlan(plan, targets);
    console.log(
      JSON.stringify({
        result: 'COPY_PASS',
        recordsWrittenOrAlreadyPresent: plan.records.length,
        calendarProjectionsAdded: projectionsAdded,
        noDeletes: true,
        devUntouched: true,
      }),
    );
  }
} catch (error) {
  console.error(`SELECTED PROD DATA COPY STOP: ${error.message}`);
  process.exitCode = 2;
}
