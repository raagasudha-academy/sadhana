import assert from 'node:assert/strict';
import test from 'node:test';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { makeCanonicalRaagaInvitationReader } from '../finalRaagaInvitations.ts';
import { makeCanonicalSrutiInvitationReader } from '../finalSrutiInvitations.ts';
import { canonicalRaagaContactGuardId } from '../finalRaagaInvitationFlow.mjs';

const sub = '12345678-1234-1234-1234-123456789abc';
const registrationId = `web_${'a'.repeat(64)}`;
const username = `parent-${registrationId.slice(4, 36)}`;
const email = 'parent@example.com';

for (const institution of ['raaga', 'sruti'] as const) {
  test(`${institution}: invitation and resend reserve verified routes`, async () => {
    const flag = `SADHANA_FINAL_${institution.toUpperCase()}_PARENT`;
    const keys = [
      'SADHANA_ENTITY_STAGE',
      'SADHANA_ENTITY_TABLE_SET',
      'SADHANA_ENTITY_FINAL_ACK',
      'SADHANA_DATA_MODE',
      `${flag}_INVITATIONS`,
      `${flag}_RESENDS`,
    ];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    Object.assign(process.env, {
      SADHANA_ENTITY_STAGE: 'dev',
      SADHANA_ENTITY_TABLE_SET: 'final',
      SADHANA_ENTITY_FINAL_ACK: 'enabled',
      SADHANA_DATA_MODE: 'final',
      [`${flag}_INVITATIONS`]: 'enabled',
      [`${flag}_RESENDS`]: 'enabled',
    });

    try {
      const transactions: any[][] = [];
      const guardian = {
        personId: 'guardian-test',
        familyId: 'family-test',
        status: 'active',
        personTypes: ['guardian'],
        institutionIds: [institution],
        email,
        firstName: 'Test',
      };

      const registration = {
        registrationId,
        institutionId: institution,
        source: 'website',
        importStatus: 'imported',
        familyId: 'family-test',
        provisioningStatus: 'NOT_INVITED',
      };

      const db = {
        async send(command: any) {
          if (command instanceof GetCommand) {
            assert.equal(
              command.input.Key.counterId,
              canonicalRaagaContactGuardId(email, institution),
            );
            return {
              Item: {
                personId: guardian.personId,
                familyId: guardian.familyId,
                institutionId: institution,
              },
            };
          }
          if (command instanceof TransactWriteCommand) {
            transactions.push(command.input.TransactItems);
            return {};
          }
          return {};
        },
      };

      const cognito = {
        async send(command: any) {
          if (command instanceof ListUsersCommand) {
            return { Users: [] };
          }
          if (command instanceof AdminCreateUserCommand) {
            return {
              User: {
                Username: username,
                Attributes: [{ Name: 'sub', Value: sub }],
              },
            };
          }
          if (command instanceof AdminGetUserCommand) {
            return {
              Enabled: true,
              UserStatus: 'FORCE_CHANGE_PASSWORD',
              UserAttributes: [
                { Name: 'email', Value: email },
                { Name: 'sub', Value: sub },
              ],
            };
          }
          throw new Error(`Unexpected command: ${command.constructor.name}`);
        },
      };

      const service =
        institution === 'raaga'
          ? makeCanonicalRaagaInvitationReader(db, cognito, 'test-pool')
          : makeCanonicalSrutiInvitationReader(db, cognito, 'test-pool');

      await service.invite(registration, guardian, 'admin-test');

      const initial = transactions[0];
      const route = initial.find(
        (action) => action.Put?.Item?.sequenceType === 'PARENT_EMAIL_ROUTE',
      )?.Put;

      assert.ok(route, 'Initial invitation must create email route');
      assert.equal(route.TableName, 'dev-sadhana-counters');
      assert.equal(route.Item.counterId, `EMAIL_ROUTE#${username}`);
      assert.equal(route.Item.institutionId, institution);
      assert.equal(route.Item.recipientEmail, email);
      assert.equal(route.Item.status, 'pending');
      assert.match(route.ConditionExpression, /attribute_not_exists/);
      assert.ok(initial.some((action) => action.Update?.TableName === 'dev-sadhana-registrations'));
      assert.ok(initial.some((action) => action.Put?.TableName === 'dev-sadhana-audit-records'));

      const invited = {
        ...registration,
        provisioningStatus: 'INVITATION_SENT',
        parentAccountUsername: username,
        parentAccountEmail: email,
        parentAccountSub: sub,
      };

      await service.resend(invited, guardian, 'admin-test');

      const resend = transactions.find((actions) =>
        actions.some((action) => action.Update?.TableName === 'dev-sadhana-counters'),
      );

      assert.ok(resend, 'Resend must reserve email route');
      const update = resend.find(
        (action) => action.Update?.TableName === 'dev-sadhana-counters',
      ).Update;

      assert.equal(update.Key.counterId, `EMAIL_ROUTE#${username}`);
      assert.equal(update.ExpressionAttributeValues[':inst'], institution);
      assert.equal(update.ExpressionAttributeValues[':reg'], registrationId);
      assert.match(update.ConditionExpression, /attribute_not_exists/);
      assert.match(update.ConditionExpression, /recipientEmail=:email/);
      assert.match(update.ConditionExpression, /#status=:pending/);
      assert.ok(resend.some((action) => action.Put?.TableName === 'dev-sadhana-audit-records'));
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
}
