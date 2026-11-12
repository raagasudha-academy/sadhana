import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { httpError } from './model.ts';
import { randomUUID } from 'node:crypto';
import { parentEmailRouteKey } from './parentEmailRoute.mjs';
import { cognitoSubjectGuardId, guardianInstitutionGuardId } from './guardianIdentityKey.mjs';

/** Read canonical people/family-links only. No legacy table names or PK/SK keys. */
export function makeM10FinalFamilyAccessReader(
  db: DynamoDBDocumentClient,
  cognito?: { send: (command: any) => Promise<any> },
  poolId = process.env.SADHANA_COGNITO_USER_POOL_ID || '',
) {
  type Entity = 'people' | 'family-links' | 'families' | 'registrations' | 'counters' | 'audit';
  const table = (entity: Entity) => entityTable(entity);
  const get = async (entity: Exclude<Entity, 'audit'>, key: string, id: string) =>
    (
      await db.send(
        new GetCommand({
          TableName: entityTable(entity),
          Key: { [key]: id },
          ConsistentRead: true,
        }),
      )
    ).Item ?? null;
  const query = async (
    entity: 'people' | 'family-links',
    index: string,
    key: string,
    value: string,
  ) => {
    const records: Record<string, any>[] = [];
    let cursor: Record<string, any> | undefined;
    do {
      const page = await db.send(
        new QueryCommand({
          TableName: entityTable(entity),
          IndexName: index,
          KeyConditionExpression: '#key=:value',
          ExpressionAttributeNames: { '#key': key },
          ExpressionAttributeValues: { ':value': value },
          ExclusiveStartKey: cursor,
          Limit: 100,
        }),
      );
      records.push(...(page.Items ?? []));
      if (records.length > 200)
        throw httpError(413, 'Too many identity records; administrator review required.');
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return records;
  };
  return {
    peopleForSubject: (sub: string) => query('people', 'CognitoIdentityIndex', 'cognitoSub', sub),
    person: (id: string) => get('people', 'personId', id),
    linksForGuardian: (id: string) =>
      query('family-links', 'GuardianAccessIndex', 'guardianPersonId', id),
    link: (id: string) => get('family-links', 'linkId', id),
    async linkInvitedSrutiParent(subject: string) {
      if (!cognito || !poolId) return null;
      const listed = await cognito.send(
        new ListUsersCommand({ UserPoolId: poolId, Filter: `sub = "${subject}"`, Limit: 2 }),
      );
      const users = (listed.Users ?? []).filter(
        (user: any) =>
          user.Enabled === true &&
          user.UserStatus === 'CONFIRMED' &&
          user.Attributes?.some((a: any) => a.Name === 'sub' && a.Value === subject) &&
          user.Attributes?.some((a: any) => a.Name === 'email_verified' && a.Value === 'true'),
      );
      if (listed.PaginationToken || users.length !== 1) return null;
      const user = users[0],
        username = String(user.Username || '');
      if (!username) return null;
      const route = await get('counters', 'counterId', parentEmailRouteKey(username));
      if (
        !route ||
        route.sequenceType !== 'PARENT_EMAIL_ROUTE' ||
        route.institutionId !== 'sruti' ||
        route.status !== 'pending' ||
        !route.registrationId ||
        !route.familyId
      )
        return null;
      const registration = await get('registrations', 'registrationId', route.registrationId);
      if (
        !registration ||
        registration.registrationId !== route.registrationId ||
        registration.institutionId !== 'sruti' ||
        registration.source !== 'website' ||
        registration.importStatus !== 'imported' ||
        registration.familyId !== route.familyId ||
        registration.parentAccountSub !== subject ||
        registration.parentAccountUsername !== username ||
        registration.parentAccountEmail !== route.recipientEmail ||
        !['INVITATION_SENT', 'ACTIVE', 'EXISTING_ACCOUNT_LINKED'].includes(
          registration.provisioningStatus,
        )
      )
        return null;
      const family = await get('families', 'familyId', route.familyId);
      if (
        !family ||
        family.familyId !== route.familyId ||
        family.status !== 'active' ||
        !family.institutionIds?.includes('sruti') ||
        !family.primaryContactPersonId
      )
        return null;
      const guardian = await get('people', 'personId', family.primaryContactPersonId);
      const email = String(user.Attributes?.find((a: any) => a.Name === 'email')?.Value || '')
        .trim()
        .toLowerCase();
      if (
        !guardian ||
        guardian.personId !== family.primaryContactPersonId ||
        guardian.familyId !== family.familyId ||
        guardian.status !== 'active' ||
        !guardian.institutionIds?.includes('sruti') ||
        !guardian.personTypes?.includes('guardian') ||
        guardian.email !== email ||
        email !== route.recipientEmail
      )
        return null;
      if (guardian.cognitoSub && guardian.cognitoSub !== subject) return null;
      const guardId = guardianInstitutionGuardId(subject, 'sruti'),
        legacyGuardId = cognitoSubjectGuardId(subject);
      const [guard, legacyGuard, subjectPeople] = await Promise.all([
        get('counters', 'counterId', guardId),
        get('counters', 'counterId', legacyGuardId),
        query('people', 'CognitoIdentityIndex', 'cognitoSub', subject),
      ]);
      if (guard && guard.personId !== guardian.personId) return null;
      const foreign = subjectPeople.filter((p) => p.personId !== guardian.personId);
      if (
        foreign.some(
          (p) =>
            p.status !== 'active' ||
            !p.personTypes?.includes('guardian') ||
            String(p.email || '')
              .trim()
              .toLowerCase() !== email ||
            !Array.isArray(p.institutionIds) ||
            p.institutionIds.includes('sruti'),
        )
      )
        return null;
      if (legacyGuard && legacyGuard.personId !== guardian.personId) {
        const owner = await get('people', 'personId', legacyGuard.personId);
        if (
          !owner ||
          owner.status !== 'active' ||
          !owner.personTypes?.includes('guardian') ||
          String(owner.email || '')
            .trim()
            .toLowerCase() !== email ||
          !Array.isArray(owner.institutionIds) ||
          owner.institutionIds.includes('sruti')
        )
          return null;
      }
      if (guardian.cognitoSub === subject && guard?.personId === guardian.personId) return guardian;
      if (!Number.isSafeInteger(guardian.version)) return null;
      const now = new Date().toISOString();
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: table('registrations'),
                  Key: { registrationId: registration.registrationId },
                  UpdateExpression: 'SET provisioningStatus=:active,updatedAt=:now',
                  ConditionExpression:
                    'institutionId=:inst AND #source=:source AND importStatus=:imported AND familyId=:family AND parentAccountSub=:sub AND parentAccountUsername=:username AND parentAccountEmail=:email AND (provisioningStatus=:invited OR provisioningStatus=:active OR provisioningStatus=:linked)',
                  ExpressionAttributeNames: { '#source': 'source' },
                  ExpressionAttributeValues: {
                    ':active': 'ACTIVE',
                    ':now': now,
                    ':inst': 'sruti',
                    ':source': 'website',
                    ':imported': 'imported',
                    ':family': family.familyId,
                    ':sub': subject,
                    ':username': username,
                    ':email': email,
                    ':invited': 'INVITATION_SENT',
                    ':linked': 'EXISTING_ACCOUNT_LINKED',
                  },
                },
              },
              {
                Update: {
                  TableName: table('people'),
                  Key: { personId: guardian.personId },
                  UpdateExpression: 'SET cognitoSub=:sub,updatedAt=:now,#version=:next',
                  ConditionExpression:
                    'attribute_exists(personId) AND email=:email AND familyId=:family AND #status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:guardian) AND attribute_not_exists(cognitoSub) AND #version=:previous',
                  ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
                  ExpressionAttributeValues: {
                    ':sub': subject,
                    ':now': now,
                    ':next': guardian.version + 1,
                    ':email': email,
                    ':family': family.familyId,
                    ':active': 'active',
                    ':inst': 'sruti',
                    ':guardian': 'guardian',
                    ':previous': guardian.version,
                  },
                },
              },
              {
                Put: {
                  TableName: table('counters'),
                  Item: {
                    counterId: guardId,
                    personId: guardian.personId,
                    institutionId: 'sruti',
                    sequenceType: 'COGNITO_SUB_GUARD',
                    createdAt: now,
                  },
                  ConditionExpression: 'attribute_not_exists(counterId)',
                },
              },
              ...(!legacyGuard
                ? [
                    {
                      Put: {
                        TableName: table('counters'),
                        Item: {
                          counterId: legacyGuardId,
                          personId: guardian.personId,
                          institutionId: 'sruti',
                          sequenceType: 'COGNITO_SUB_GUARD',
                          createdAt: now,
                        },
                        ConditionExpression: 'attribute_not_exists(counterId)',
                      },
                    },
                  ]
                : []),
              {
                Put: {
                  TableName: table('audit'),
                  Item: {
                    auditId: `guardian_identity_${randomUUID()}`,
                    institutionId: 'sruti',
                    actorCognitoSub: subject,
                    action: 'INVITED_PARENT_IDENTITY_LINKED',
                    resourceType: 'person',
                    resourceId: guardian.personId,
                    result: 'success',
                    timestamp: now,
                    schemaVersion: 1,
                  },
                  ConditionExpression: 'attribute_not_exists(auditId)',
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          ['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(
            String((error as any).name),
          )
        )
          return null;
        throw error;
      }
      return get('people', 'personId', guardian.personId);
    },
  };
}
let cached: ReturnType<typeof makeM10FinalFamilyAccessReader> | undefined;
export function m10FinalFamilyAccessReader() {
  return (cached ??= makeM10FinalFamilyAccessReader(
    DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      { marshallOptions: { removeUndefinedValues: true } },
    ),
    new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' }),
  ));
}
