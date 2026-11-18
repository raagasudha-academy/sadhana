/** Dedicated, verified account linking for an existing canonical teacher profile. */
import { randomUUID } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { cognitoSubjectGuardId } from './guardianIdentityKey.mjs';
import { entityTable } from './entityTables.mjs';
import { clean, demandInstitution, httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';

type Client = { send: (command: any) => Promise<any> };
const subjectPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: string) => /^TEACHER-[0-9a-f-]{36}$/i.test(id);
const attr = (attributes: any[], name: string) =>
  attributes?.find((row) => row.Name === name)?.Value || '';

export function makeFinalTeacherAccountLink(
  db: Client,
  cognito: Client,
  poolId: string,
  now = () => new Date().toISOString(),
  uuid = () => randomUUID(),
) {
  return async function linkTeacherAccount(
    inst: InstitutionId,
    claims: Claims,
    id: string,
    body: any,
  ) {
    demandInstitution(claims, inst);
    if (!validId(id)) throw httpError(400, 'Invalid teacher ID.');
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) =>
          !['cognitoSub', 'expectedVersion', 'confirmTeacherName', 'identityVerified'].includes(
            key,
          ),
      )
    )
      throw httpError(400, 'Invalid teacher account-link request.');
    const cognitoSub = typeof body.cognitoSub === 'string' ? clean(body.cognitoSub) : '';
    if (!subjectPattern.test(cognitoSub)) throw httpError(400, 'Enter a valid Cognito sub.');
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1)
      throw httpError(400, 'Refresh the teacher profile before linking an account.');
    if (body.identityVerified !== true)
      throw httpError(
        400,
        'Confirm that you verified this Cognito account belongs to the teacher.',
      );
    if (!poolId) throw httpError(503, 'Cognito identity verification is not configured.');

    const users = await cognito.send(
      new ListUsersCommand({ UserPoolId: poolId, Filter: `sub = "${cognitoSub}"`, Limit: 10 }),
    );
    const matches = (users.Users ?? []).filter(
      (user: any) => attr(user.Attributes, 'sub') === cognitoSub,
    );
    if (
      users.PaginationToken ||
      matches.length !== 1 ||
      matches[0].Enabled !== true ||
      matches[0].UserStatus !== 'CONFIRMED'
    )
      throw httpError(409, 'Choose one active, confirmed Sadhana login.');

    const response = await db.send(
      new GetCommand({
        TableName: entityTable('people'),
        Key: { personId: id },
        ConsistentRead: true,
      }),
    );
    const person = response.Item;
    if (!person || person.legacyPayload?.id !== id || !person.personTypes?.includes('teacher'))
      throw httpError(404, 'Teacher not found. Refresh the teacher directory.');
    const teacher = person.legacyPayload;
    if (
      !Array.isArray(teacher.institutions) ||
      !teacher.institutions.includes(inst) ||
      !person.institutionIds?.includes(inst)
    )
      throw httpError(403, 'Teacher does not belong to this academy.');
    for (const academy of teacher.institutions) demandInstitution(claims, academy);
    if (
      (typeof person.cognitoSub === 'string' && person.cognitoSub) ||
      (typeof teacher.cognitoSub === 'string' && teacher.cognitoSub)
    )
      throw httpError(409, 'This teacher already has a linked Sadhana login.');
    if (
      !Number.isSafeInteger(person.version) ||
      person.version < 1 ||
      !Number.isSafeInteger(teacher.version) ||
      teacher.version !== body.expectedVersion
    )
      throw httpError(409, 'Teacher profile changed; refresh and retry.');
    if (
      typeof body.confirmTeacherName !== 'string' ||
      clean(body.confirmTeacherName) !== clean(teacher.displayName || '')
    )
      throw httpError(400, 'Type the teacher’s full name exactly to confirm the link.');

    const guardId = cognitoSubjectGuardId(cognitoSub);
    const [guard, linked] = await Promise.all([
      db.send(
        new GetCommand({
          TableName: entityTable('counters'),
          Key: { counterId: guardId },
          ConsistentRead: true,
        }),
      ),
      db.send(
        new QueryCommand({
          TableName: entityTable('people'),
          IndexName: 'CognitoIdentityIndex',
          KeyConditionExpression: 'cognitoSub=:sub',
          ExpressionAttributeValues: { ':sub': cognitoSub },
          Limit: 20,
        }),
      ),
    ]);
    if (guard.Item || (linked.Items ?? []).length || linked.LastEvaluatedKey)
      throw httpError(409, 'This Sadhana login is already linked to a person.');

    const timestamp = now();
    const version = person.version;
    const nextTeacherVersion = teacher.version + 1;
    const transactions: any[] = [
      {
        Update: {
          TableName: entityTable('people'),
          Key: { personId: person.personId },
          UpdateExpression:
            'SET cognitoSub=:sub, legacyPayload.cognitoSub=:sub, #v=:next, updatedAt=:now, legacyPayload.version=:teacherVersion, legacyPayload.updatedAt=:now',
          ConditionExpression:
            '#v=:previous AND (attribute_not_exists(#sub) OR #sub=:empty) AND (attribute_not_exists(#legacy.#sub) OR #legacy.#sub=:empty) AND contains(personTypes,:teacher) AND contains(institutionIds,:inst) AND #legacy.#legacyVersion=:teacherVersionBefore',
          ExpressionAttributeNames: {
            '#v': 'version',
            '#sub': 'cognitoSub',
            '#legacy': 'legacyPayload',
            '#legacyVersion': 'version',
          },
          ExpressionAttributeValues: {
            ':sub': cognitoSub,
            ':empty': '',
            ':next': version + 1,
            ':previous': version,
            ':teacherVersion': nextTeacherVersion,
            ':teacherVersionBefore': teacher.version,
            ':now': timestamp,
            ':teacher': 'teacher',
            ':inst': inst,
          },
        },
      },
      {
        Put: {
          TableName: entityTable('counters'),
          Item: {
            counterId: guardId,
            personId: person.personId,
            institutionId: inst,
            sequenceType: 'COGNITO_SUB_GUARD',
            createdAt: timestamp,
          },
          ConditionExpression: 'attribute_not_exists(counterId)',
        },
      },
    ];
    for (const academy of teacher.institutions as InstitutionId[])
      transactions.push({
        Put: {
          TableName: entityTable('audit'),
          Item: {
            auditId: `AUDIT-${uuid()}`,
            institutionId: academy,
            action: 'TEACHER_COGNITO_ACCOUNT_LINKED',
            resourceType: 'teacher',
            resourceId: id,
            actorCognitoSub: claims.sub,
            linkedCognitoSub: cognitoSub,
            cognitoUsername: matches[0].Username || '',
            timestamp,
          },
          ConditionExpression: 'attribute_not_exists(auditId)',
        },
      });
    try {
      await db.send(new TransactWriteCommand({ TransactItems: transactions }));
    } catch (error: any) {
      if (['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(error?.name))
        throw httpError(409, 'Teacher or Sadhana account changed. Refresh and verify again.');
      throw error;
    }
    return {
      id,
      cognitoSub,
      username: matches[0].Username || '',
      email: attr(matches[0].Attributes, 'email'),
      version: nextTeacherVersion,
      linked: true,
    };
  };
}

let singleton: ReturnType<typeof makeFinalTeacherAccountLink> | undefined;
export function finalTeacherAccountLink() {
  if (!singleton)
    singleton = makeFinalTeacherAccountLink(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
        { marshallOptions: { removeUndefinedValues: true } },
      ),
      new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      process.env.SADHANA_COGNITO_USER_POOL_ID || '',
    );
  return singleton;
}
