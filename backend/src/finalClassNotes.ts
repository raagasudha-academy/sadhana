/** Canonical class notes stored as a discriminated record in the learning table. */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { authorisedStudent, matchingCognitoActor } from './finalAccessCore.mjs';
import type { Claims, InstitutionId } from './model.ts';

type Row = Record<string, any>;
type Client = { send(command: any): Promise<any> };
const failure = (status: number, message: string) => Object.assign(new Error(message), { status });
const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const isClassNote = (row: Row) =>
  row.recordType === 'class-note' &&
  typeof row.practiceId === 'string' &&
  row.practiceId.startsWith('CLASSNOTE-');
const project = (row: Row) => ({
  id: row.practiceId,
  institution: row.institutionId,
  classId: row.classId,
  date: row.date,
  note: row.note,
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export function makeFinalClassNotes(client: Client) {
  const get = async (entity: string, key: string, value: string) =>
    (
      await client.send(
        new GetCommand({ TableName: entityTable(entity), Key: { [key]: value }, ConsistentRead: true }),
      )
    ).Item ?? null;

  async function scan(entity: 'practice' | 'classes' | 'enrolments') {
    const rows: Row[] = [];
    let cursor: Record<string, any> | undefined;
    do {
      const page = await client.send(
        new ScanCommand({
          TableName: entityTable(entity),
          ConsistentRead: true,
          Limit: 200,
          ExclusiveStartKey: cursor,
        }),
      );
      rows.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > 6000) throw failure(413, 'Class notes require pagination.');
    } while (cursor);
    return rows;
  }

  async function notes(inst: InstitutionId, classIds?: ReadonlySet<string>) {
    const rows = (await scan('practice')).filter(
      (row) => isClassNote(row) && row.institutionId === inst && (!classIds || classIds.has(row.classId)),
    );
    return { records: rows.map(project).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)) };
  }

  async function getNote(inst: InstitutionId, id: string) {
    if (!/^CLASSNOTE-[a-f\d-]{36}$/i.test(id)) return null;
    const item = await get('practice', 'practiceId', id);
    return item && isClassNote(item) && item.institutionId === inst ? project(item) : null;
  }

  async function save(inst: InstitutionId, actor: string, data: Row, existingId?: string) {
    if (!actor) throw failure(401, 'Authentication required.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure(400, 'Invalid class note.');
    const allowed = existingId
      ? new Set(['note', 'expectedVersion', 'classId', 'date'])
      : new Set(['classId', 'date', 'note']);
    if (Object.keys(data).some((field) => !allowed.has(field))) throw failure(400, 'Unsupported class note field.');
    if (typeof data.classId !== 'string' || !data.classId || !validDate(data.date))
      throw failure(400, 'Choose a class and valid date.');
    if (typeof data.note !== 'string' || !data.note.trim() || data.note.trim().length > 2000)
      throw failure(400, 'Add a class note of up to 2000 characters.');
    if (existingId && !/^CLASSNOTE-[a-f\d-]{36}$/i.test(existingId)) throw failure(400, 'Invalid class note ID.');

    const cls = await get('classes', 'classId', data.classId);
    if (!cls || cls.institutionId !== inst || cls.lifecycleStatus === 'archived' || cls.archived === true)
      throw failure(404, 'Active class not found.');
    const prior = existingId ? await get('practice', 'practiceId', existingId) : null;
    if (existingId && (!prior || !isClassNote(prior) || prior.institutionId !== inst))
      throw failure(404, 'Class note not found.');
    if (prior) {
      if (!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion !== prior.version)
        throw failure(409, 'Class note changed; refresh and retry.');
      if (data.classId !== prior.classId || data.date !== prior.date)
        throw failure(400, 'Class and date cannot change when editing a class note.');
    } else {
      const sameDate = (await notes(inst)).records.some(
        (row) => row.classId === data.classId && row.date === data.date,
      );
      if (sameDate) throw failure(409, 'A class note already exists for this class and date. Edit it instead.');
    }
    const now = new Date().toISOString();
    const id = existingId ?? `CLASSNOTE-${randomUUID()}`;
    const item = {
      practiceId: id,
      recordType: 'class-note',
      institutionId: inst,
      classId: prior?.classId ?? data.classId,
      date: prior?.date ?? data.date,
      note: data.note.trim(),
      version: (prior?.version ?? 0) + 1,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      updatedBy: actor,
    };
    const audit = {
      auditId: `AUDIT-${randomUUID()}`,
      institutionId: inst,
      action: prior ? 'classNoteEdit' : 'classNoteCreate',
      actorCognitoSub: actor,
      timestamp: now,
      resourceType: 'class-note',
      resourceId: id,
    };
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: entityTable('practice'),
                Item: item,
                ...(prior
                  ? {
                      ConditionExpression: '#v=:version AND institutionId=:inst AND recordType=:kind',
                      ExpressionAttributeNames: { '#v': 'version' },
                      ExpressionAttributeValues: { ':version': prior.version, ':inst': inst, ':kind': 'class-note' },
                    }
                  : { ConditionExpression: 'attribute_not_exists(practiceId)' }),
              },
            },
            {
              Put: {
                TableName: entityTable('audit'),
                Item: audit,
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
    } catch (error: any) {
      if (error.name === 'TransactionCanceledException') throw failure(409, 'Class note changed; refresh and retry.');
      throw error;
    }
    return { record: project(item) };
  }

  async function forLearner(inst: InstitutionId, claims: Claims, studentId: string) {
    if (!claims.sub || !/^[-_a-zA-Z0-9]{4,150}$/.test(studentId))
      throw failure(403, 'Approved student access required.');
    const identityPage = await client.send(
      new QueryCommand({
        TableName: entityTable('people'),
        IndexName: 'CognitoIdentityIndex',
        KeyConditionExpression: 'cognitoSub=:sub',
        ExpressionAttributeValues: { ':sub': claims.sub },
        ConsistentRead: false,
      }),
    );
    const actor = matchingCognitoActor(identityPage.Items ?? [], claims.sub, inst);
    if (!actor) throw failure(403, 'A verified portal identity is required.');
    const currentActor = await get('people', 'personId', actor.personId);
    const student = await get('people', 'personId', studentId);
    let links: Row[] = [];
    if (actor.personId !== studentId) {
      const linked = await client.send(
        new QueryCommand({
          TableName: entityTable('family-links'),
          IndexName: 'GuardianAccessIndex',
          KeyConditionExpression: 'guardianPersonId=:guardian',
          ExpressionAttributeValues: { ':guardian': actor.personId },
        }),
      );
      links = await Promise.all(
        (linked.Items ?? [])
          .filter((row: Row) => row.studentId === studentId && row.institutionId === inst)
          .map((row: Row) => get('family-links', 'linkId', row.linkId)),
      );
      links = links.filter(Boolean);
    }
    if (
      !currentActor || currentActor.cognitoSub !== claims.sub || currentActor.status !== 'active' ||
      (!currentActor.institutionIds?.includes(inst) && !currentActor.personTypes?.includes('guardian'))
    ) throw failure(403, 'A verified portal identity is required.');
    authorisedStudent(currentActor, student, links, inst);
    const enrolments = (await scan('enrolments')).filter(
      (row) => row.institutionId === inst && row.studentId === studentId && row.status === 'active' && row.archived !== true,
    );
    const allowedClasses = new Set<string>();
    const names = new Map<string, string>();
    for (const id of new Set(enrolments.map((row) => row.classId).filter(Boolean))) {
      const cls = await get('classes', 'classId', id);
      if (cls?.institutionId === inst && cls.lifecycleStatus !== 'archived' && cls.archived !== true) {
        allowedClasses.add(id);
        names.set(id, String(cls.name || 'Class'));
      }
    }
    const result = await notes(inst, allowedClasses);
    return {
      records: result.records.map((row) => ({ ...row, className: names.get(row.classId) || 'Class' })),
    };
  }

  return { list: notes, get: getNote, save, forLearner };
}

let cached: ReturnType<typeof makeFinalClassNotes> | undefined;
export function finalClassNotes() {
  return (cached ??= makeFinalClassNotes(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })),
  ));
}
