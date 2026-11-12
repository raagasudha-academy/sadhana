import assert from 'node:assert/strict';
import test from 'node:test';
import { makeInstitutionEmailSender } from '../cognitoInstitutionEmailSender.ts';

const pool = 'us-east-1_nyQjIQasG';
const loginUrl = 'https://raagasudha-academy.github.io/sadhana/';

const codeEvents = [
  'CustomEmailSender_SignUp',
  'CustomEmailSender_ResendCode',
  'CustomEmailSender_ForgotPassword',
  'CustomEmailSender_UpdateUserAttribute',
  'CustomEmailSender_VerifyUserAttribute',
  'CustomEmailSender_Authentication',
];

function event(triggerSource: string, username = 'existing-user') {
  return {
    triggerSource,
    userPoolId: pool,
    userName: username,
    request: {
      type: 'customEmailSenderRequestV1',
      code: 'encrypted-test-code',
      userAttributes: {
        email: 'parent@example.com',
        name: 'Test Parent',
      },
    },
  };
}

function setup(institution: 'raaga' | 'sruti' = 'sruti') {
  const sent: any[] = [];
  let decryptCalls = 0;
  let resolveCalls = 0;

  const handler = makeInstitutionEmailSender({
    userPoolId: pool,
    loginUrl,
    resolve: async () => {
      resolveCalls++;
      return institution;
    },
    decrypt: async () => {
      decryptCalls++;
      return 'TEST-SECRET-123';
    },
    send: async (message) => {
      sent.push(message);
    },
  });

  return {
    handler,
    sent,
    get decryptCalls() {
      return decryptCalls;
    },
    get resolveCalls() {
      return resolveCalls;
    },
  };
}

test('Sruti parent invitation uses Sruti sender', async () => {
  const s = setup('sruti');
  await s.handler(event('CustomEmailSender_AdminCreateUser', 'parent-123456789abcdef'));
  assert.match(s.sent[0].from, /noreply@sruti\.co\.uk/);
  assert.match(s.sent[0].html, /TEST-SECRET-123/);
  assert.equal(s.resolveCalls, 1);
});

test('Raagasudha invitation uses Raagasudha sender', async () => {
  const s = setup('raaga');
  await s.handler(event('CustomEmailSender_AdminCreateUser', 'parent-123456789abcdef'));
  assert.match(s.sent[0].from, /noreply@raagasudhamusic\.co\.uk/);
});

for (const trigger of codeEvents) {
  test(`${trigger} sends a code`, async () => {
    const s = setup();
    await s.handler(event(trigger));
    assert.equal(s.sent.length, 1);
    assert.match(s.sent[0].text, /TEST-SECRET-123/);
    assert.match(s.sent[0].from, /Sadhana Portal/);
    assert.equal(s.resolveCalls, 0);
    assert.equal(s.decryptCalls, 1);
  });
}

test('Existing parent password reset needs no route', async () => {
  const s = setup();
  await s.handler(event('CustomEmailSender_ForgotPassword', 'parent-existing-account'));
  assert.equal(s.resolveCalls, 0);
  assert.equal(s.sent.length, 1);
});

test('Account takeover warning does not decrypt', async () => {
  const s = setup();
  await s.handler(event('CustomEmailSender_AccountTakeOverNotification'));
  assert.equal(s.decryptCalls, 0);
  assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].subject, /Security notice/);
});

test('Wrong user pool is rejected', async () => {
  const s = setup();
  await assert.rejects(
    s.handler({
      ...event('CustomEmailSender_ForgotPassword'),
      userPoolId: 'another-pool',
    }),
  );
  assert.equal(s.sent.length, 0);
});

test('Unknown trigger is rejected', async () => {
  const s = setup();
  await assert.rejects(s.handler(event('UnknownTrigger')));
  assert.equal(s.sent.length, 0);
});

test('Invalid email is rejected', async () => {
  const s = setup();
  const e = event('CustomEmailSender_ForgotPassword');
  e.request.userAttributes.email = 'invalid';
  await assert.rejects(s.handler(e));
  assert.equal(s.sent.length, 0);
});

test('Unverified parent route prevents sending', async () => {
  let sent = false;
  let decrypted = false;

  const handler = makeInstitutionEmailSender({
    userPoolId: pool,
    loginUrl,
    resolve: async () => {
      throw Error('Unverified parent route');
    },
    decrypt: async () => {
      decrypted = true;
      return 'secret';
    },
    send: async () => {
      sent = true;
    },
  });

  await assert.rejects(
    handler(event('CustomEmailSender_AdminCreateUser', 'parent-123456789abcdef')),
  );

  assert.equal(decrypted, false);
  assert.equal(sent, false);
});
