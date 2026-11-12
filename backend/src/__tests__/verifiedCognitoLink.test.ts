import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM9VerifiedCognitoLink } from '../verifiedCognitoLink.ts';
const regId = 'web_' + 'a'.repeat(64);
const admin = { sub: 'admin-sub', 'cognito:groups': ['raagasudha-admin'] };
const registration = {
  registrationId: regId,
  institutionId: 'raaga',
  importStatus: 'imported',
  familyId: 'fam1',
};
const family = { familyId: 'fam1', primaryContactPersonId: 'per1', institutionIds: ['raaga'] };
const person = {
  personId: 'per1',
  familyId: 'fam1',
  email: 'parent@example.org',
  status: 'active',
  personTypes: ['guardian'],
  institutionIds: ['raaga'],
  version: 1,
};
function setup(verified = 'true') {
  const calls: any[] = [];
  const db = {
    send: async (c: any) => {
      calls.push(c);
      const i = c.input;
      if (c.constructor.name === 'GetCommand') {
        if (i.TableName.endsWith('-registrations')) return { Item: registration };
        if (i.TableName.endsWith('-families')) return { Item: family };
        if (i.TableName.endsWith('-people')) return { Item: person };
        if (i.TableName.endsWith('-counters')) return { Item: undefined };
      }
      if (c.constructor.name === 'QueryCommand') return { Items: [] };
      return {};
    },
  };
  const cognito = {
    send: async () => ({
      Users: [
        {
          Enabled: true,
          UserStatus: 'CONFIRMED',
          Attributes: [
            { Name: 'email', Value: 'parent@example.org' },
            { Name: 'email_verified', Value: verified },
            { Name: 'sub', Value: 'verified-sub' },
          ],
        },
      ],
    }),
  };
  return { calls, service: makeM9VerifiedCognitoLink(db, cognito, 'pool1') };
}
test('verified existing Cognito user preview never writes', async () => {
  const before = process.env.M95_ONBOARDING_MODE;
  process.env.M95_ONBOARDING_MODE = 'enabled';
  try {
    const x = setup();
    const result = await x.service(regId, 'raaga', admin, false, 'verified-sub');
    assert.equal(result.readyToLink, true);
    assert.equal(result.guardianAccessGranted, false);
    assert.equal(x.calls.filter((c) => c.constructor.name === 'TransactWriteCommand').length, 0);
  } finally {
    if (before === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = before;
  }
});
test('unverified existing email blocks linking', async () => {
  const before = process.env.M95_ONBOARDING_MODE;
  process.env.M95_ONBOARDING_MODE = 'enabled';
  try {
    await assert.rejects(
      setup('false').service(regId, 'raaga', admin, false, 'verified-sub'),
      /verified Cognito identity/,
    );
  } finally {
    if (before === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = before;
  }
});
test('cross academy administrator denied before any database reads', async () => {
  const before = process.env.M95_ONBOARDING_MODE;
  process.env.M95_ONBOARDING_MODE = 'enabled';
  try {
    const x = setup();
    await assert.rejects(x.service(regId, 'sruti', admin, false, 'verified-sub'), /administrator/);
    assert.equal(x.calls.length, 0);
  } finally {
    if (before === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = before;
  }
});
test('explicit execute binds identity, creates unique guard and audit without granting guardian access', async () => {
  const oldMode = process.env.M95_ONBOARDING_MODE,
    oldWrite = process.env.M9_VERIFIED_IDENTITY_LINK_WRITES;
  process.env.M95_ONBOARDING_MODE = 'enabled';
  process.env.M9_VERIFIED_IDENTITY_LINK_WRITES = 'enabled';
  try {
    const x = setup();
    const result = await x.service(regId, 'raaga', admin, true, 'verified-sub');
    assert.equal(result.linked, true);
    assert.equal(result.guardianAccessGranted, false);
    const tx = x.calls.find((c) => c.constructor.name === 'TransactWriteCommand')?.input;
    assert.equal(tx.TransactItems.length, 5);
    assert.equal(tx.TransactItems[0].Update.ExpressionAttributeValues[':sub'], 'verified-sub');
    assert.equal(tx.TransactItems[1].Put.Item.sequenceType, 'COGNITO_SUB_GUARD');
    assert.equal(tx.TransactItems[2].Put.Item.sequenceType, 'COGNITO_SUB_GUARD');
    assert.equal(
      tx.TransactItems[3].Update.ExpressionAttributeValues[':linked'],
      'EXISTING_ACCOUNT_LINKED',
    );
    assert.equal(tx.TransactItems[4].Put.Item.action, 'VERIFIED_EXISTING_COGNITO_LINK');
  } finally {
    if (oldMode === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = oldMode;
    if (oldWrite === undefined) delete process.env.M9_VERIFIED_IDENTITY_LINK_WRITES;
    else process.env.M9_VERIFIED_IDENTITY_LINK_WRITES = oldWrite;
  }
});

test('omitted Cognito subject resolves a unique verified email without writing', async () => {
  const old = process.env.M95_ONBOARDING_MODE;
  process.env.M95_ONBOARDING_MODE = 'enabled';
  try {
    const f = setup();
    const result = await f.service(regId, 'raaga', admin, false);
    assert.equal(result.readyToLink, true);
    assert.equal(result.guardianAccessGranted, false);
    assert.equal(
      f.calls.some((c) => c.constructor.name === 'TransactWriteCommand'),
      false,
    );
  } finally {
    if (old === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = old;
  }
});
test('administrator-selected subject mismatch never writes', async () => {
  const old = process.env.M95_ONBOARDING_MODE;
  process.env.M95_ONBOARDING_MODE = 'enabled';
  try {
    const f = setup();
    await assert.rejects(
      f.service(regId, 'raaga', admin, false, 'different-sub'),
      /verified Cognito identity/,
    );
    assert.equal(
      f.calls.some((c) => c.constructor.name === 'TransactWriteCommand'),
      false,
    );
  } finally {
    if (old === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = old;
  }
});
