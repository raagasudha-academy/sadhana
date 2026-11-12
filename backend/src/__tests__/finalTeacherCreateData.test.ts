import test from 'node:test';
import assert from 'node:assert/strict';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { makeFinalTeacherCreate } from '../finalTeacherCreateData.ts';

const sub = '540b1a18-5df6-45de-a343-93a3f88e432d';
const groups = { 'cognito:groups': ['raagasudha-admin', 'sruti-admin'] };
process.env.SADHANA_ENTITY_TABLE_SET = 'final';
process.env.SADHANA_ENTITY_FINAL_ACK = 'enabled';
process.env.SADHANA_DATA_MODE = 'final';
const valid = {
  displayName: ' Teacher One ',
  institutions: ['raaga', 'sruti'],
  subjects: [' Vocal ', 'Vocal'],
  aliases: ['T. One'],
  cognitoSub: '',
  active: true,
};
function fixture(options: any = {}) {
  const { guard, linked, users } = options;
  const dbCalls: any[] = [],
    cognitoCalls: any[] = [];
  const db = {
    async send(command: any) {
      dbCalls.push(command);
      if (command instanceof GetCommand) return { Item: guard };
      if (command instanceof QueryCommand) return { Items: linked || [] };
      if (command instanceof TransactWriteCommand) return {};
      throw Error(command.constructor.name);
    },
  };
  const cognito = {
    async send(command: any) {
      cognitoCalls.push(command);
      if (command instanceof ListUsersCommand)
        return (
          users ?? {
            Users: [
              { Attributes: [{ Name: 'sub', Value: sub }], Enabled: true, UserStatus: 'CONFIRMED' },
            ],
          }
        );
      throw Error(command.constructor.name);
    },
  };
  const create = makeFinalTeacherCreate(
    db,
    cognito,
    'pool',
    () => '2026-11-09T12:00:00.000Z',
    () => '11111111-2222-4333-8444-555555555555',
  );
  return { create, dbCalls, cognitoCalls };
}
test('creates canonical teacher and both academy audits atomically without legacy table writes', async () => {
  const f = fixture();
  const record = await f.create('raaga', { sub: 'admin', ...groups }, valid);
  assert.equal(record.id, 'TEACHER-11111111-2222-4333-8444-555555555555');
  assert.equal(record.displayName, 'Teacher One');
  assert.deepEqual(record.subjects, ['Vocal']);
  assert.equal(record.version, 1);
  const transaction = f.dbCalls.find((x) => x instanceof TransactWriteCommand).input;
  assert.equal(transaction.TransactItems.length, 3);
  const person = transaction.TransactItems.find((x: any) => x.Put?.TableName.endsWith('-people'))
    .Put.Item;
  assert.equal(person.personId, record.id);
  assert.deepEqual(person.personTypes, ['teacher']);
  assert.deepEqual(person.institutionIds, ['raaga', 'sruti']);
  assert.equal(person.legacyPayload.id, record.id);
  assert.equal(person.legacyPayload.PK, 'TEACHER_REGISTRY');
  assert.equal(person.cognitoSub, undefined);
  assert.deepEqual(
    transaction.TransactItems.filter((x: any) => x.Put?.TableName.endsWith('-audit-records'))
      .map((x: any) => x.Put.Item.institutionId)
      .sort(),
    ['raaga', 'sruti'],
  );
  assert.equal(
    f.dbCalls.some((x) => x.input?.TableName?.includes('m9-')),
    false,
  );
  assert.equal(f.cognitoCalls.length, 0);
});
test('links only one verified confirmed Cognito user and atomically reserves the global subject', async () => {
  const f = fixture();
  const record = await f.create(
    'raaga',
    { sub: 'admin', ...groups },
    { ...valid, institutions: ['raaga'], cognitoSub: sub },
  );
  assert.equal(record.cognitoSub, sub);
  const lookup = f.cognitoCalls[0];
  assert.equal(lookup.input.Filter, `sub = "${sub}"`);
  const commands = f.dbCalls;
  assert.ok(
    commands.some((x) => x instanceof GetCommand && x.input.TableName.endsWith('-counters')),
  );
  assert.ok(
    commands.some((x) => x instanceof QueryCommand && x.input.IndexName === 'CognitoIdentityIndex'),
  );
  const tx = commands.find((x) => x instanceof TransactWriteCommand).input.TransactItems;
  assert.equal(tx.length, 3);
  const guard = tx.find((x: any) => x.Put?.TableName.endsWith('-counters')).Put;
  assert.match(guard.Item.counterId, /^COGNITO_SUB#[a-f0-9]{64}$/);
  assert.equal(guard.Item.personId, record.id);
});
test('rejects missing, ambiguous, disabled, or unconfirmed Cognito accounts before writing', async () => {
  for (const users of [
    { Users: [] },
    {
      Users: [
        { Attributes: [{ Name: 'sub', Value: sub }], Enabled: false, UserStatus: 'CONFIRMED' },
      ],
    },
    {
      Users: [
        {
          Attributes: [{ Name: 'sub', Value: sub }],
          Enabled: true,
          UserStatus: 'FORCE_CHANGE_PASSWORD',
        },
      ],
    },
    {
      Users: [
        { Attributes: [{ Name: 'sub', Value: sub }], Enabled: true, UserStatus: 'CONFIRMED' },
        { Attributes: [{ Name: 'sub', Value: sub }], Enabled: true, UserStatus: 'CONFIRMED' },
      ],
      PaginationToken: 'more',
    },
  ]) {
    const f = fixture({ users });
    await assert.rejects(
      f.create(
        'raaga',
        { sub: 'admin', ...groups },
        { ...valid, institutions: ['raaga'], cognitoSub: sub },
      ),
      { status: 409 },
    );
    assert.equal(
      f.dbCalls.some((x) => x instanceof TransactWriteCommand),
      false,
    );
  }
});
test('preexisting identity index rows or uniqueness guards block duplicate account links', async () => {
  const f1 = fixture({ linked: [{ personId: 'OTHER' }] });
  await assert.rejects(
    f1.create(
      'raaga',
      { sub: 'admin', ...groups },
      { ...valid, institutions: ['raaga'], cognitoSub: sub },
    ),
    { status: 409 },
  );
  const f2 = fixture({ guard: { counterId: 'guard', personId: 'OTHER' } });
  await assert.rejects(
    f2.create(
      'raaga',
      { sub: 'admin', ...groups },
      { ...valid, institutions: ['raaga'], cognitoSub: sub },
    ),
    { status: 409 },
  );
  assert.equal(
    f1.dbCalls.some((x) => x instanceof TransactWriteCommand),
    false,
  );
  assert.equal(
    f2.dbCalls.some((x) => x instanceof TransactWriteCommand),
    false,
  );
});
test('validates exact institutions, admin scope, subject syntax, and fields before write', async () => {
  for (const body of [
    { ...valid, subjects: [] },
    { ...valid, extra: 'x' },
    { ...valid, institutions: ['raaga', 'sruti'] },
    { ...valid, cognitoSub: 'not-an-id' },
    { ...valid, active: 'true' },
  ]) {
    const f = fixture();
    await assert.rejects(
      f.create('raaga', { sub: 'admin', 'cognito:groups': ['raagasudha-admin'] }, body),
    );
    assert.equal(
      f.dbCalls.some((x) => x instanceof TransactWriteCommand),
      false,
    );
  }
  const f = fixture();
  await assert.rejects(
    f.create(
      'raaga',
      { sub: 'admin', 'cognito:groups': ['sruti-admin'] },
      { ...valid, institutions: ['sruti'] },
    ),
    { status: 403 },
  );
  assert.equal(f.dbCalls.length, 0);
});
