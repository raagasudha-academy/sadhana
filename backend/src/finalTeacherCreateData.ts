/** Canonical teacher creation with verified Cognito linking and atomic audit. */
import { createHash, randomUUID } from 'node:crypto';
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
import { entityTable } from './entityTables.mjs';
import { clean, demandInstitution, httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';

type Client = { send: (command: any) => Promise<any> };
const subjectPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId = (id: string) => /^TEACHER-[0-9a-f-]{36}$/i.test(id);
const subjectGuardId = (sub: string) =>
  `COGNITO_SUB#${createHash('sha256').update(sub).digest('hex')}`;
const attr = (attributes: any[], name: string) =>
  attributes?.find((row) => row.Name === name)?.Value || '';

export function makeFinalTeacherCreate(
  db: Client,
  cognito: Client,
  poolId: string,
  now = () => new Date().toISOString(),
  uuid = () => randomUUID(),
) {
  return async function createTeacher(inst: InstitutionId, claims: Claims, body: any) {
    demandInstitution(claims, inst);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw httpError(400, 'Invalid teacher body.');
    const allowed = ['displayName', 'institutions', 'subjects', 'aliases', 'cognitoSub', 'active'];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      throw httpError(400, 'Unsupported teacher field.');
    const displayName = typeof body.displayName === 'string' ? clean(body.displayName) : '';
    if (!displayName || displayName.length > 100)
      throw httpError(400, 'Teacher name is required and must be 100 characters or fewer.');
    if (
      !Array.isArray(body.institutions) ||
      !body.institutions.length ||
      body.institutions.length > 2 ||
      body.institutions.some((x: any) => x !== 'raaga' && x !== 'sruti')
    )
      throw httpError(400, 'Select valid institutions.');
    const institutions = [...new Set(body.institutions)] as InstitutionId[];
    for (const academy of institutions) demandInstitution(claims, academy);
    if (!institutions.includes(inst))
      throw httpError(400, 'The request academy must be included in the teacher profile.');
    const list = (value: any, maxItems: number, maxChars: number) => {
      if (
        !Array.isArray(value) ||
        value.length > maxItems ||
        value.some((x: any) => typeof x !== 'string')
      )
        throw httpError(400, 'Invalid teacher list field.');
      const result = [...new Set(value.map((x: string) => clean(x)))];
      if (result.some((x) => !x || x.length > maxChars))
        throw httpError(400, 'Teacher list field is empty or too long.');
      return result;
    };
    const subjects = list(body.subjects, 10, 60),
      aliases = list(body.aliases, 12, 100);
    if (!subjects.length) throw httpError(400, 'At least one teaching subject is required.');
    if (typeof body.active !== 'boolean') throw httpError(400, 'Choose active or inactive.');
    const cognitoSub = typeof body.cognitoSub === 'string' ? clean(body.cognitoSub) : '';
    if (cognitoSub && !subjectPattern.test(cognitoSub))
      throw httpError(400, 'Use the Cognito sub, not an email.');
    if (cognitoSub) {
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
      const [guardResult, linked] = await Promise.all([
        db.send(
          new GetCommand({
            TableName: entityTable('counters'),
            Key: { counterId: subjectGuardId(cognitoSub) },
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
      if (guardResult.Item || (linked.Items ?? []).length || linked.LastEvaluatedKey)
        throw httpError(409, 'This Sadhana login is already linked to a person.');
    }
    const id = `TEACHER-${uuid()}`;
    if (!safeId(id)) throw Error('Teacher ID generator returned an invalid ID.');
    const timestamp = now();
    const legacyPayload = {
      PK: 'TEACHER_REGISTRY',
      SK: `TEACHER#${id}`,
      entityType: 'teacher',
      id,
      displayName,
      institutions,
      subjects,
      aliases,
      cognitoSub,
      active: body.active,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const person: any = {
      personId: id,
      displayName,
      personTypes: ['teacher'],
      directoryGroup: 'teacher',
      displayNameSort: displayName.toLocaleLowerCase('en-GB'),
      institutionIds: institutions,
      status: body.active ? 'active' : 'inactive',
      staffProfile: { teacherId: id, subjects, aliases },
      legacyPayload,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (cognitoSub) person.cognitoSub = cognitoSub;
    const actions: any[] = [
      {
        Put: {
          TableName: entityTable('people'),
          Item: person,
          ConditionExpression: 'attribute_not_exists(personId)',
        },
      },
    ];
    if (cognitoSub)
      actions.push({
        Put: {
          TableName: entityTable('counters'),
          Item: {
            counterId: subjectGuardId(cognitoSub),
            personId: id,
            institutionId: inst,
            sequenceType: 'COGNITO_SUB_GUARD',
            createdAt: timestamp,
          },
          ConditionExpression: 'attribute_not_exists(counterId)',
        },
      });
    for (const academy of institutions)
      actions.push({
        Put: {
          TableName: entityTable('audit'),
          Item: {
            auditId: `AUDIT-${uuid()}`,
            institutionId: academy,
            action: 'TEACHER_CREATED',
            actorCognitoSub: claims.sub,
            resourceType: 'teacher',
            resourceId: id,
            timestamp,
          },
          ConditionExpression: 'attribute_not_exists(auditId)',
        },
      });
    try {
      await db.send(new TransactWriteCommand({ TransactItems: actions }));
    } catch (error: any) {
      if (['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(error?.name))
        throw httpError(409, 'Teacher or Cognito link changed. Refresh and retry.');
      throw error;
    }
    return {
      id,
      displayName,
      institutions,
      subjects,
      aliases,
      cognitoSub,
      active: body.active,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };
}

let singleton: ReturnType<typeof makeFinalTeacherCreate> | undefined;
export function finalTeacherCreate() {
  if (!singleton)
    singleton = makeFinalTeacherCreate(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
        { marshallOptions: { removeUndefinedValues: true } },
      ),
      new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      process.env.SADHANA_COGNITO_USER_POOL_ID || '',
    );
  return singleton;
}
