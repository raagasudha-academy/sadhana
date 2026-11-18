import test from 'node:test';
import assert from 'node:assert/strict';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { makeFinalTeacherAccountLink } from '../finalTeacherAccountLink.ts';

process.env.SADHANA_ENTITY_TABLE_SET = 'final';
process.env.SADHANA_ENTITY_FINAL_ACK = 'enabled';
process.env.SADHANA_DATA_MODE = 'final';

const sub = '540b1a18-5df6-45de-a343-93a3f88e432d';
const teacherId = 'TEACHER-11111111-2222-4333-8444-555555555555';
const claims = { sub: 'admin-sub', 'cognito:groups': ['raagasudha-admin', 'sruti-admin'] };
const teacher = {
  personId: teacherId,
  displayName: 'Teacher One',
  personTypes: ['teacher'],
  institutionIds: ['raaga', 'sruti'],
  cognitoSub: '',
  version: 4,
  legacyPayload: {
    id: teacherId,
    displayName: 'Teacher One',
    institutions: ['raaga', 'sruti'],
    cognitoSub: '',
    version: 2,
  },
};

function fixture(options: any = {}) {
  const dbCalls: any[] = [];
  const cognitoCalls: any[] = [];
  const db = {
    async send(command: any) {
      dbCalls.push(command);
      if (command instanceof GetCommand) {
        if (command.input.TableName.endsWith('-people'))
          return { Item: options.person === undefined ? teacher : options.person };
        return { Item: options.guard };
      }
      if (command instanceof QueryCommand)
        return { Items: options.linked || [], LastEvaluatedKey: options.linkedCursor };
      if (command instanceof TransactWriteCommand) return {};
      throw Error(command.constructor.name);
    },
  };
  const cognito = {
    async send(command: any) {
      cognitoCalls.push(command);
      if (command instanceof ListUsersCommand)
        return (
          options.users ?? {
            Users: [
              {
                Username: 'teacher.user',
                Enabled: true,
                UserStatus: 'CONFIRMED',
                Attributes: [
                  { Name: 'sub', Value: sub },
                  { Name: 'email', Value: 'teacher@example.com' },
                ],
              },
            ],
          }
        );
      throw Error(command.constructor.name);
    },
  };
  const link = makeFinalTeacherAccountLink(
    db,
    cognito,
    'pool-id',
    () => '2026-11-18T12:00:00.000Z',
    () => '22222222-3333-4444-8555-666666666666',
  );
  return { link, dbCalls, cognitoCalls };
}

const validBody = {
  cognitoSub: sub,
  expectedVersion: 2,
  confirmTeacherName: 'Teacher One',
  identityVerified: true,
};

test('links one active confirmed Cognito user to the existing teacher with atomic guards and audits', async () => {
  const f = fixture();
  const result = await f.link('raaga', claims, teacherId, validBody);

  assert.deepEqual(result, {
    id: teacherId,
    cognitoSub: sub,
    username: 'teacher.user',
    email: 'teacher@example.com',
    version: 3,
    linked: true,
  });
  const lookup = f.cognitoCalls[0];
  assert.equal(lookup.input.Filter, `sub = "${sub}"`);
  const personRead = f.dbCalls.find(
    (command) => command instanceof GetCommand && command.input.TableName.endsWith('-people'),
  );
  assert.deepEqual(personRead.input.Key, { personId: teacherId });
  const transaction = f.dbCalls.find((command) => command instanceof TransactWriteCommand).input;
  assert.equal(transaction.TransactItems.length, 4);
  const personUpdate = transaction.TransactItems.find((item: any) => item.Update)?.Update;
  assert.match(personUpdate.UpdateExpression, /legacyPayload\.cognitoSub=:sub/);
  assert.match(personUpdate.ConditionExpression, /attribute_not_exists\(#sub\) OR #sub=:empty/);
  assert.deepEqual(personUpdate.Key, { personId: teacherId });
  assert.equal(
    transaction.TransactItems.filter((item: any) => item.Put?.TableName.endsWith('-audit-records'))
      .length,
    2,
  );
  assert.ok(
    f.dbCalls.some(
      (command) =>
        command instanceof QueryCommand && command.input.IndexName === 'CognitoIdentityIndex',
    ),
  );
});

test('rejects wrong name confirmation and missing explicit identity verification before writing', async () => {
  for (const body of [
    { ...validBody, confirmTeacherName: 'Different Person' },
    { ...validBody, identityVerified: false },
  ]) {
    const f = fixture();
    await assert.rejects(f.link('raaga', claims, teacherId, body), { status: 400 });
    assert.equal(
      f.dbCalls.some((command) => command instanceof TransactWriteCommand),
      false,
    );
  }
});

test('rejects account mismatch, unconfirmed or disabled users before writing', async () => {
  const cases = [
    { Users: [] },
    {
      Users: [
        {
          Enabled: false,
          UserStatus: 'CONFIRMED',
          Attributes: [{ Name: 'sub', Value: sub }],
        },
      ],
    },
    {
      Users: [
        {
          Enabled: true,
          UserStatus: 'FORCE_CHANGE_PASSWORD',
          Attributes: [{ Name: 'sub', Value: sub }],
        },
      ],
    },
    {
      Users: [
        { Enabled: true, UserStatus: 'CONFIRMED', Attributes: [{ Name: 'sub', Value: sub }] },
        { Enabled: true, UserStatus: 'CONFIRMED', Attributes: [{ Name: 'sub', Value: sub }] },
      ],
      PaginationToken: 'more',
    },
  ];
  for (const users of cases) {
    const f = fixture({ users });
    await assert.rejects(f.link('raaga', claims, teacherId, validBody), { status: 409 });
    assert.equal(
      f.dbCalls.some((command) => command instanceof TransactWriteCommand),
      false,
    );
  }
});

test('rejects unrelated academy, cross-academy admin gap, stale versions, and linked identities', async () => {
  const wrongAcademy = fixture({ person: { ...teacher, institutionIds: ['sruti'] } });
  await assert.rejects(wrongAcademy.link('raaga', claims, teacherId, validBody), { status: 403 });

  const singleAcademyAdmin = { sub: 'admin-sub', 'cognito:groups': ['raagasudha-admin'] };
  const crossAcademy = fixture();
  await assert.rejects(crossAcademy.link('raaga', singleAcademyAdmin, teacherId, validBody), {
    status: 403,
  });

  const stale = fixture();
  await assert.rejects(
    stale.link('raaga', claims, teacherId, { ...validBody, expectedVersion: 1 }),
    { status: 409 },
  );

  for (const options of [
    { linked: [{ personId: 'OTHER' }] },
    { linkedCursor: { personId: 'MORE' } },
    { guard: { counterId: 'guard', personId: 'OTHER' } },
    {
      person: {
        ...teacher,
        cognitoSub: 'already-linked-sub',
        legacyPayload: { ...teacher.legacyPayload, cognitoSub: 'already-linked-sub' },
      },
    },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.link('raaga', claims, teacherId, validBody), { status: 409 });
    assert.equal(
      f.dbCalls.some((command) => command instanceof TransactWriteCommand),
      false,
    );
  }
});
