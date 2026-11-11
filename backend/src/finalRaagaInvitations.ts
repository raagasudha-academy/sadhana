/** AWS adapter for the tested final-only invitation state machine. */
import {randomUUID} from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient, GetCommand, TransactWriteCommand, UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {parentEmailRouteRecord} from './parentEmailRoute.mjs';
import {createCanonicalRaagaInvitationFlow, canonicalRaagaContactGuardId} from './finalRaagaInvitationFlow.mjs';

const table = (kind: string) => entityTable(kind);

export function makeCanonicalRaagaInvitationReader(db: { send: (cmd: any) => Promise<any> }, cognito: {
  send: (cmd: any) => Promise<any>
}, poolId: string) {
  const pool = () => {
    if (!poolId) throw Object.assign(new Error('Cognito user pool not configured.'), {status: 503});
    return poolId;
  };
  const identityConditions = (guardian: any, reg: any) => [
    {
      ConditionCheck: {
        TableName: table('people'),
        Key: {personId: guardian.personId},
        ConditionExpression: 'attribute_exists(personId) AND email=:email AND familyId=:family AND #status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:guardian) AND attribute_not_exists(cognitoSub)',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {
          ':email': guardian.email,
          ':family': reg.familyId,
          ':active': 'active',
          ':inst': 'raaga',
          ':guardian': 'guardian'
        }
      }
    },
    {
      ConditionCheck: {
        TableName: table('counters'), Key: {counterId: canonicalRaagaContactGuardId(guardian.email)},
        ConditionExpression: 'personId=:person AND familyId=:family AND institutionId=:inst',
        ExpressionAttributeValues: {':person': guardian.personId, ':family': reg.familyId, ':inst': 'raaga'}
      }
    }
  ];
  const ops = {
    contact: async (email: string) => (await db.send(new GetCommand({
      TableName: table('counters'),
      Key: {counterId: canonicalRaagaContactGuardId(email)},
      ConsistentRead: true
    }))).Item ?? null,
    listByEmail: async (email: string) => {
      const res = await cognito.send(new ListUsersCommand({
        UserPoolId: pool(),
        Filter: `email = "${email}"`,
        Limit: 20
      }));
      // Even a non-exact or unverified Cognito match is a conflict: no duplicates.
      return {count: (res.Users ?? []).length, paginated: Boolean(res.PaginationToken)};
    },
    reserveInvite: (reg: any, guardian: any, actor: string, op: string, ts: string) => db.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: table('registrations'), Key: {registrationId: reg.registrationId},
            UpdateExpression: 'SET provisioningStatus=:creating,invitationOperationId=:op,invitationRequestedAt=:now,updatedAt=:now',
            ConditionExpression: 'provisioningStatus=:not AND familyId=:family AND institutionId=:institution AND importStatus=:imported AND attribute_not_exists(parentAccountSub) AND attribute_not_exists(invitationOperationId)',
            ExpressionAttributeValues: {
              ':creating': 'INVITATION_CREATING',
              ':not': 'NOT_INVITED',
              ':op': op,
              ':now': ts,
              ':family': reg.familyId,
              ':institution': 'raaga',
              ':imported': 'imported'
            }
          }
        },
        {
          Put: {
            TableName: table('audit'), Item: {
              auditId: `parent_invite_${op}`, institutionId: 'raaga', actorCognitoSub: actor,
              action: 'PARENT_INVITATION_REQUESTED', resourceType: 'registration', resourceId: reg.registrationId,
              result: 'requested', timestamp: ts, schemaVersion: 1
            }, ConditionExpression: 'attribute_not_exists(auditId)'
          }
        },
        {Put:{TableName:table('counters'),Item:parentEmailRouteRecord(reg,guardian,ts),ConditionExpression:'attribute_not_exists(counterId)'}},
    ...identityConditions(guardian, reg)
      ]
    })),
    createUser: (username: string, email: string, name: string) => cognito.send(new AdminCreateUserCommand({
      UserPoolId: pool(), Username: username,
      UserAttributes: [{Name: 'email', Value: email}, {Name: 'name', Value: name}], DesiredDeliveryMediums: ['EMAIL']
    })).then(x => x.User),
    completeInvite: (reg: any, op: string, username: string, email: string, sub: string, ts: string) => db.send(new UpdateCommand({
      TableName: table('registrations'), Key: {registrationId: reg.registrationId},
      UpdateExpression: 'SET provisioningStatus=:sent,parentAccountSub=:sub,parentAccountUsername=:username,parentAccountEmail=:email,provisioningUpdatedAt=:now,parentInvitationLastSentAt=:now,updatedAt=:now',
      ConditionExpression: 'provisioningStatus=:creating AND invitationOperationId=:op AND familyId=:family',
      ExpressionAttributeValues: {
        ':sent': 'INVITATION_SENT', ':creating': 'INVITATION_CREATING', ':op': op, ':sub': sub,
        ':username': username, ':email': email, ':now': ts, ':family': reg.familyId
      }
    })),
    getUser: (username: string) => cognito.send(new AdminGetUserCommand({UserPoolId: pool(), Username: username})),
    reserveResend: (reg: any, guardian: any, actor: string, op: string, ts: string, threshold: string) => db.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: table('registrations'), Key: {registrationId: reg.registrationId},
            UpdateExpression: 'SET parentInvitationAttemptAt=:now,parentInvitationOperationId=:op,parentInvitationAttemptBy=:actor',
            ConditionExpression: 'provisioningStatus=:sent AND familyId=:family AND parentAccountSub=:sub AND parentAccountUsername=:username AND parentAccountEmail=:email AND (attribute_not_exists(parentInvitationAttemptAt) OR parentInvitationAttemptAt < :threshold)',
            ExpressionAttributeValues: {
              ':sent': 'INVITATION_SENT',
              ':family': reg.familyId,
              ':sub': reg.parentAccountSub,
              ':username': reg.parentAccountUsername,
              ':email': guardian.email,
              ':now': ts,
              ':threshold': threshold,
              ':op': op,
              ':actor': actor
            }
          }
        },
        {
          Put: {
            TableName: table('audit'), Item: {
              auditId: `parent_resend_${op}`,
              institutionId: 'raaga',
              actorCognitoSub: actor,
              action: 'PARENT_INVITATION_RESEND_REQUESTED',
              resourceType: 'registration',
              resourceId: reg.registrationId,
              result: 'requested',
              timestamp: ts,
              schemaVersion: 1
            }, ConditionExpression: 'attribute_not_exists(auditId)'
          }
        },
        {
      Update: {
        TableName: table('counters'),
        Key: {
          counterId: parentEmailRouteRecord(reg, guardian, ts).counterId
        },
        UpdateExpression:
          'SET sequenceType=:type,institutionId=:inst,' +
          'registrationId=:reg,familyId=:family,' +
          'recipientEmail=:email,#status=:pending,' +
          'createdAt=if_not_exists(createdAt,:now)',
        ConditionExpression:
          'attribute_not_exists(counterId) OR ' +
          '(sequenceType=:type AND institutionId=:inst ' +
          'AND registrationId=:reg AND familyId=:family ' +
          'AND recipientEmail=:email AND #status=:pending)',
        ExpressionAttributeNames: {'#status': 'status'},
        ExpressionAttributeValues: {
          ':type': 'PARENT_EMAIL_ROUTE',
          ':inst': reg.institutionId,
          ':reg': reg.registrationId,
          ':family': reg.familyId,
          ':email': guardian.email.trim().toLowerCase(),
          ':pending': 'pending',
          ':now': ts
        }
      }
    },
    ...identityConditions(guardian, reg)
      ]
    })),
    sendResend: (username: string) => cognito.send(new AdminCreateUserCommand({
      UserPoolId: pool(), Username: username,
      MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL']
    })),
    completeResend: (reg: any, actor: string, op: string, ts: string) => db.send(new UpdateCommand({
      TableName: table('registrations'), Key: {registrationId: reg.registrationId},
      UpdateExpression: 'SET parentInvitationLastResentAt=:now,parentInvitationLastResentBy=:actor',
      ConditionExpression: 'parentInvitationOperationId=:op AND provisioningStatus=:sent',
      ExpressionAttributeValues: {':now': ts, ':actor': actor, ':op': op, ':sent': 'INVITATION_SENT'}
    })),
  };
  return createCanonicalRaagaInvitationFlow(ops, process.env, () => new Date().toISOString(), randomUUID);
}

let singleton: ReturnType<typeof makeCanonicalRaagaInvitationReader> | undefined;

export function m10FinalRaagaInvitations() {
  return singleton ??= makeCanonicalRaagaInvitationReader(
    DynamoDBDocumentClient.from(new DynamoDBClient({region: process.env.AWS_REGION || 'us-east-1'}), {marshallOptions: {removeUndefinedValues: true}}),
    new CognitoIdentityProviderClient({region: process.env.AWS_REGION || 'us-east-1'}),
    process.env.SADHANA_COGNITO_USER_POOL_ID || '');
}
