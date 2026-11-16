/** Audited, institution-authorised teacher activation/archive changes on final people. */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { demandInstitution, httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';

type DB = { send: (command: any) => Promise<any> };
const teacherId = (value: unknown) => /^TEACHER-[0-9a-f-]{36}$/i.test(String(value || ''));

export function makeFinalTeacherLifecycle(db: DB, now = () => new Date().toISOString()) {
  return async function updateTeacherLifecycle(
    institution: InstitutionId,
    claims: Claims,
    id: string,
    body: any,
  ) {
    demandInstitution(claims, institution);
    if (!teacherId(id)) throw httpError(400, 'Invalid teacher ID.');
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'active,expectedVersion' ||
      typeof body.active !== 'boolean' ||
      !Number.isSafeInteger(body.expectedVersion) ||
      body.expectedVersion < 1
    )
      throw httpError(400, 'Choose an active state and provide the current teacher version.');
    const response = await db.send(
      new GetCommand({
        TableName: entityTable('people'),
        Key: { personId: id },
        ConsistentRead: true,
      }),
    );
    const person = response.Item;
    const prior = person?.legacyPayload;
    if (!person || prior?.id !== id || !person.personTypes?.includes('teacher'))
      throw httpError(404, 'Teacher not found in canonical people.');
    if (
      !Array.isArray(prior.institutions) ||
      !prior.institutions.includes(institution) ||
      !person.institutionIds?.includes(institution)
    )
      throw httpError(403, 'Teacher does not belong to this academy.');
    if (!Number.isSafeInteger(prior.version) || prior.version !== body.expectedVersion)
      throw httpError(409, 'Teacher profile changed; refresh and retry.');
    // Activation is global to a multi-academy teacher, so require an admin in each academy.
    for (const academy of prior.institutions as InstitutionId[]) {
      if (academy !== 'raaga' && academy !== 'sruti')
        throw httpError(409, 'Teacher academy memberships require review before this change.');
      demandInstitution(claims, academy);
    }
    if (prior.active === body.active)
      return { ...prior, version: prior.version, cognitoSub: prior.cognitoSub || '' };

    const timestamp = now();
    const updated = {
      ...prior,
      active: body.active,
      version: prior.version + 1,
      updatedAt: timestamp,
    };
    const nextPerson = {
      ...person,
      status: body.active ? 'active' : 'inactive',
      legacyPayload: updated,
      version: person.version + 1,
      updatedAt: timestamp,
    };
    const writes: any[] = [
      {
        Put: {
          TableName: entityTable('people'),
          Item: nextPerson,
          ConditionExpression:
            'attribute_exists(personId) AND #personVersion=:previousPersonVersion AND #legacy.#legacyVersion=:previousLegacyVersion AND contains(#types,:teacher)',
          ExpressionAttributeNames: {
            '#personVersion': 'version',
            '#legacy': 'legacyPayload',
            '#legacyVersion': 'version',
            '#types': 'personTypes',
          },
          ExpressionAttributeValues: {
            ':previousPersonVersion': person.version,
            ':previousLegacyVersion': prior.version,
            ':teacher': 'teacher',
          },
        },
      },
      ...(prior.institutions as InstitutionId[]).map((academy) => ({
        Put: {
          TableName: entityTable('audit'),
          Item: {
            auditId: `AUDIT-${randomUUID()}`,
            institutionId: academy,
            action: body.active ? 'TEACHER_RESTORED' : 'TEACHER_ARCHIVED',
            actorCognitoSub: claims.sub,
            resourceType: 'teacher',
            resourceId: id,
            timestamp,
          },
          ConditionExpression: 'attribute_not_exists(auditId)',
        },
      })),
    ];
    try {
      await db.send(new TransactWriteCommand({ TransactItems: writes }));
    } catch (error: any) {
      if (['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(error?.name))
        throw httpError(409, 'Teacher changed. Refresh and retry.');
      throw error;
    }
    return { ...updated, cognitoSub: prior.cognitoSub || '' };
  };
}

export async function finalTeacherLifecycleRoute(
  context: any,
  deps: any,
  access: any,
  env = process.env,
) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return undefined;
  const { parts, method, query = {}, claims, event = {} } = context;
  if (
    parts?.[0] !== 'teachers' ||
    parts.length !== 3 ||
    parts[2] !== 'lifecycle' ||
    method !== 'PATCH'
  )
    return undefined;
  if (!claims?.sub)
    return { status: 401, body: { error: 'Authenticated administrator required.' } };
  if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
    return { status: 503, body: { error: 'Canonical tables not acknowledged.' } };
  if (env.SADHANA_FINAL_TEACHER_LIFECYCLE_WRITES !== 'enabled')
    return { status: 503, body: { error: 'Teacher lifecycle changes are disabled.' } };
  const institution = query.institution ?? context.inst;
  if (institution !== 'raaga' && institution !== 'sruti')
    return { status: 400, body: { error: 'Invalid academy.' } };
  access.admin(claims, institution);
  const body = deps.parse(event);
  const record = await deps.update(institution, claims, parts[1], body);
  return { status: 200, body: { record } };
}

let singleton: ReturnType<typeof makeFinalTeacherLifecycle> | undefined;
export function finalTeacherLifecycle() {
  if (!singleton)
    singleton = makeFinalTeacherLifecycle(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
        {
          marshallOptions: { removeUndefinedValues: true },
        },
      ),
    );
  return singleton;
}
