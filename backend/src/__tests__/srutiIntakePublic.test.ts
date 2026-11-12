import test from 'node:test';
import assert from 'node:assert/strict';
import { PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { makeM91SrutiIntakeHandler } from '../srutiIntakePublic.ts';

const origin = 'https://sruti.co.uk';
const valid = {
  institution: 'sruti',
  registrationType: 'child',
  guardian: {
    firstName: 'Test',
    lastName: 'Guardian',
    email: 'test@example.org',
    phone: '07123456789',
    relationship: 'Parent',
    address1: '1 Test Street',
    address2: '',
    city: 'Durham',
    postcode: 'DH1 1AA',
    emergencyName: 'Emergency Contact',
    emergencyPhone: '+447700900123',
    additionalNotes: '',
  },
  students: [
    {
      firstName: 'Child',
      lastName: 'Guardian',
      dateOfBirth: '2012-05-21',
      applicantType: 'child',
      gender: '',
      school: 'School',
      interests: 'Music',
      experience: '',
      allergies: 'None',
      medicalNotes: '',
    },
  ],
  consents: { registration: true, photography: false },
};
const event = (method: string, body?: string, headers: any = { origin }) => ({
  headers,
  requestContext: { http: { method } },
  body,
});
async function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [key, value] of Object.entries(values))
    value === undefined ? delete process.env[key] : (process.env[key] = value);
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(old))
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  }
}

test('public Sruti intake enforces origin and supports allowed preflight without storage', async () => {
  let calls = 0;
  const handler = makeM91SrutiIntakeHandler({
    send: async () => {
      calls++;
      return {};
    },
  } as any);
  assert.equal(
    (await handler(event('POST', JSON.stringify(valid), { origin: 'https://evil.example' })))
      .statusCode,
    403,
  );
  const preflight = await handler(event('OPTIONS'));
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-methods'], 'POST,OPTIONS');
  assert.equal(calls, 0);
});

test('disabled intake, invalid submission and honeypot never persist data', async () =>
  withEnv({ M91_SRUTI_PUBLIC_INTAKE: 'enabled' }, async () => {
    const commands: any[] = [];
    const handler = makeM91SrutiIntakeHandler({
      send: async (c: any) => {
        commands.push(c);
        return {};
      },
    } as any);
    process.env.M91_SRUTI_PUBLIC_INTAKE = 'disabled';
    assert.equal((await handler(event('POST', JSON.stringify(valid)))).statusCode, 503);
    process.env.M91_SRUTI_PUBLIC_INTAKE = 'enabled';
    assert.equal((await handler(event('POST', '{'))).statusCode, 400);
    assert.equal(
      (
        await handler(
          event('POST', JSON.stringify({ ...valid, consents: { registration: false } })),
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (await handler(event('POST', JSON.stringify({ ...valid, website: { company: 'bot' } }))))
        .statusCode,
      202,
    );
    assert.equal(commands.length, 0);
  }));

test('valid registration conditionally writes one M9 record and returns a small receipt', async () =>
  withEnv(
    {
      M91_SRUTI_PUBLIC_INTAKE: 'enabled',
      M91_SRUTI_REGISTRATIONS_TABLE: undefined,
      M91_SRUTI_REGISTRATIONS_MIRROR_TABLE: undefined,
    },
    async () => {
      const commands: any[] = [];
      const handler = makeM91SrutiIntakeHandler({
        send: async (c: any) => {
          commands.push(c);
          return {};
        },
      } as any);
      const result = await handler(event('POST', JSON.stringify(valid)));
      assert.equal(result.statusCode, 202);
      const body = JSON.parse(result.body);
      assert.deepEqual(Object.keys(body).sort(), ['received', 'registrationId']);
      assert.match(body.registrationId, /^SR-2026-[A-F0-9]{6}$/);
      assert.equal(commands.length, 1);
      assert.ok(commands[0] instanceof PutCommand);
      assert.equal(commands[0].input.TableName, 'sadhana-dev-m9-registrations');
      assert.equal(commands[0].input.ConditionExpression, 'attribute_not_exists(registrationId)');
      assert.equal(commands[0].input.Item.institutionId, 'sruti');
      assert.equal(commands[0].input.Item.reviewStatus, 'pending');
    },
  ));

test('mirror mode uses one atomic transaction and retries an ID collision', async () =>
  withEnv(
    {
      M91_SRUTI_PUBLIC_INTAKE: 'enabled',
      M91_SRUTI_REGISTRATIONS_TABLE: undefined,
      M91_SRUTI_REGISTRATIONS_MIRROR_TABLE: 'sadhana-dev-registrations',
    },
    async () => {
      const commands: any[] = [];
      const handler = makeM91SrutiIntakeHandler({
        send: async (c: any) => {
          commands.push(c);
          if (commands.length === 1)
            throw Object.assign(new Error('collision'), {
              name: 'ConditionalCheckFailedException',
            });
          return {};
        },
      } as any);
      const result = await handler(event('POST', JSON.stringify(valid)));
      assert.equal(result.statusCode, 202);
      assert.equal(commands.length, 2);
      for (const command of commands) {
        assert.ok(command instanceof TransactWriteCommand);
        assert.deepEqual(
          command.input.TransactItems.map((x: any) => x.Put.TableName),
          ['sadhana-dev-m9-registrations', 'sadhana-dev-registrations'],
        );
        assert.ok(
          command.input.TransactItems.every(
            (x: any) => x.Put.ConditionExpression === 'attribute_not_exists(registrationId)',
          ),
        );
      }
    },
  ));

test('public intake rejects unsupported methods and oversized bodies before storage', async () =>
  withEnv({ M91_SRUTI_PUBLIC_INTAKE: 'enabled' }, async () => {
    let calls = 0;
    const handler = makeM91SrutiIntakeHandler({
      send: async () => {
        calls++;
        return {};
      },
    } as any);
    assert.equal((await handler(event('GET'))).statusCode, 405);
    assert.equal((await handler(event('POST', 'x'.repeat(25001)))).statusCode, 413);
    assert.equal(calls, 0);
  }));

test('repeated collisions and storage errors fail closed without logging registration data', async () =>
  withEnv(
    {
      M91_SRUTI_PUBLIC_INTAKE: 'enabled',
      M91_SRUTI_REGISTRATIONS_TABLE: undefined,
      M91_SRUTI_REGISTRATIONS_MIRROR_TABLE: undefined,
    },
    async () => {
      const original = console.error;
      const logs: any[] = [];
      console.error = (...args: any[]) => {
        logs.push(args);
      };
      try {
        let collisionCalls = 0;
        const collisionHandler = makeM91SrutiIntakeHandler({
          send: async () => {
            collisionCalls++;
            throw Object.assign(new Error('test@example.org collision'), {
              name: 'ConditionalCheckFailedException',
            });
          },
        } as any);
        assert.equal(
          (await collisionHandler(event('POST', JSON.stringify(valid)))).statusCode,
          503,
        );
        assert.equal(collisionCalls, 8);
        const failedHandler = makeM91SrutiIntakeHandler({
          send: async () => {
            throw new Error('test@example.org storage failure');
          },
        } as any);
        assert.equal((await failedHandler(event('POST', JSON.stringify(valid)))).statusCode, 503);
        assert.ok(logs.length >= 2);
        assert.equal(
          logs.every((args) => !JSON.stringify(args).includes('test@example.org')),
          true,
        );
        assert.ok(logs.every((args) => args[1] && Object.keys(args[1]).join(',') === 'errorType'));
      } finally {
        console.error = original;
      }
    },
  ));
