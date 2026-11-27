/** Canonical student-level SwaraMitra channel preference and permission record. */
import { randomUUID } from 'node:crypto';
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

type DB = { send: (command: any) => Promise<any> };
const preference = (person: any) => {
  const value = person.studentProfile?.swaraMitra;
  return {
    // Read older records written by the previous permission/source model.
    // New records use the single registration-backed allowed/unallowed flag.
    whatsappAllowed:
      typeof value?.whatsappAllowed === 'boolean'
        ? value.whatsappAllowed
        : value?.permissionStatus === 'granted' && value?.whatsappEnabled !== false,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : null,
  };
};

async function studentsForClass(db: DB, inst: InstitutionId, ids: string[]) {
  if (!ids.length) return [];
  const selected = new Set(ids);
  const rows: any[] = [];
  let cursor: any;
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: entityTable('people'),
        ConsistentRead: true,
        Limit: 200,
        ExclusiveStartKey: cursor,
      }),
    );
    rows.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
    if (rows.length > 1500)
      throw httpError(503, 'Student preference list is temporarily unavailable.');
  } while (cursor);
  return rows
    .filter(
      (person) =>
        selected.has(person.personId) &&
        person.personTypes?.includes('student') &&
        person.institutionIds?.includes(inst) &&
        person.status !== 'archived',
    )
    .map((person) => ({ studentId: person.personId, ...preference(person) }));
}

export function makeFinalSwaraMitraPreferences(db: DB, now = () => new Date().toISOString()) {
  return {
    list: (inst: InstitutionId, studentIds: string[]) => studentsForClass(db, inst, studentIds),
    async update(
      inst: InstitutionId,
      studentId: string,
      claims: Claims,
      input: { whatsappAllowed: boolean },
    ) {
      // Imported students keep STUDENT-* IDs; students created in the
      // canonical people model use PERSON-* IDs. Both are emitted by the
      // authorised class roster and are resolved by the same personId key.
      if (!/^(?:STUDENT|PERSON)-[0-9a-f-]{36}$/i.test(studentId))
        throw httpError(400, 'Invalid student ID.');
      const response = await db.send(
        new GetCommand({
          TableName: entityTable('people'),
          Key: { personId: studentId },
          ConsistentRead: true,
        }),
      );
      const person = response.Item;
      if (
        !person ||
        !person.personTypes?.includes('student') ||
        !person.institutionIds?.includes(inst) ||
        person.status === 'archived'
      )
        throw httpError(404, 'Active student not found.');
      if (!Number.isSafeInteger(person.version) || person.version < 1)
        throw httpError(409, 'Student record cannot be safely updated.');
      if (typeof input?.whatsappAllowed !== 'boolean')
        throw httpError(400, 'Choose whether WhatsApp is allowed for this student.');

      const timestamp = now();
      const previous = preference(person);
      const nextPreference = {
        whatsappAllowed: input.whatsappAllowed,
        updatedAt: timestamp,
        updatedBy: claims.sub || '',
      };
      const next = {
        ...person,
        studentProfile: { ...(person.studentProfile || {}), swaraMitra: nextPreference },
        version: person.version + 1,
        updatedAt: timestamp,
      };
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: entityTable('people'),
                  Item: next,
                  ConditionExpression:
                    'attribute_exists(personId) AND #v=:v AND contains(#types,:student) AND contains(institutionIds,:inst)',
                  ExpressionAttributeNames: { '#v': 'version', '#types': 'personTypes' },
                  ExpressionAttributeValues: {
                    ':v': person.version,
                    ':student': 'student',
                    ':inst': inst,
                  },
                },
              },
              {
                Put: {
                  TableName: entityTable('audit'),
                  Item: {
                    auditId: `AUDIT-${randomUUID()}`,
                    institutionId: inst,
                    action: 'SWARAMITRA_COMMUNICATION_SETTINGS_UPDATED',
                    actorCognitoSub: claims.sub || '',
                    resourceType: 'student',
                    resourceId: studentId,
                    timestamp,
                    metadata: {
                      previousWhatsappAllowed: previous.whatsappAllowed,
                      whatsappAllowed: nextPreference.whatsappAllowed,
                    },
                  },
                  ConditionExpression: 'attribute_not_exists(auditId)',
                },
              },
            ],
          }),
        );
      } catch (error: any) {
        if (
          ['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(error?.name)
        )
          throw httpError(409, 'Student settings changed. Refresh and try again.');
        throw error;
      }
      return { studentId, ...nextPreference };
    },
  };
}

let singleton: ReturnType<typeof makeFinalSwaraMitraPreferences> | undefined;
export function finalSwaraMitraPreferences() {
  if (!singleton)
    singleton = makeFinalSwaraMitraPreferences(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
        { marshallOptions: { removeUndefinedValues: true } },
      ),
    );
  return singleton;
}
