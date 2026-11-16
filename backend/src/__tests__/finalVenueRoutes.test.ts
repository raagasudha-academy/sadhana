import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFinalVenueWriter } from '../finalVenueRoutes.ts';

test('final venue edit accepts expectedVersion with the editable venue fields', async () => {
  const calls: any[] = [];
  const existing = {
    venueId: 'VENUE-MIDDLESBROUGH',
    institutionId: 'shared',
    version: 2,
    legacyPayload: {
      id: 'VENUE-MIDDLESBROUGH',
      version: 2,
      name: 'Old venue name',
      location: 'Middlesbrough',
      address: 'Old address',
      postcode: 'TS1 1AA',
      notes: '',
    },
  };
  const db = {
    async send(command: any) {
      calls.push(command);
      if (command.constructor.name === 'GetCommand') return { Item: existing };
      if (command.constructor.name === 'TransactWriteCommand') return {};
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };
  const write = makeFinalVenueWriter(db, () => '2026-11-16T13:00:00.000Z');

  const result = await write(
    'sruti',
    { sub: 'sruti-admin', 'cognito:groups': ['sruti-admin'] },
    'VENUE-MIDDLESBROUGH',
    {
      name: 'Middlesbrough Hindu Temple',
      location: 'Middlesbrough',
      address: '54 Westbourne Grove, North Ormesby',
      postcode: 'TS3 6EF',
      notes: 'None',
      expectedVersion: 2,
    },
  );

  assert.equal(result.version, 3);
  assert.equal(result.name, 'Middlesbrough Hindu Temple');
  assert.equal(result.postcode, 'TS3 6EF');
  assert.equal(result.notes, 'None');
  assert.equal(
    calls.filter((command) => command.constructor.name === 'TransactWriteCommand').length,
    1,
  );
});

test('final venue edit accepts the revision stored in legacyPayload when top-level version is absent', async () => {
  const calls: any[] = [];
  const existing = {
    venueId: 'VENUE-MIDDLESBROUGH',
    institutionId: 'shared',
    legacyPayload: {
      id: 'VENUE-MIDDLESBROUGH',
      version: 2,
      name: 'Old venue name',
      location: 'Middlesbrough',
      address: 'Old address',
      postcode: 'TS1 1AA',
      notes: '',
    },
  };
  const db = {
    async send(command: any) {
      calls.push(command);
      if (command.constructor.name === 'GetCommand') return { Item: existing };
      if (command.constructor.name === 'TransactWriteCommand') return {};
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };
  const write = makeFinalVenueWriter(db, () => '2026-11-16T13:00:00.000Z');

  const result = await write(
    'raaga',
    { sub: 'raaga-admin', 'cognito:groups': ['raagasudha-admin'] },
    'VENUE-MIDDLESBROUGH',
    {
      name: 'Middlesbrough Hindu Temple',
      location: 'Middlesbrough',
      address: '54 Westbourne Grove, North Ormesby',
      postcode: 'TS3 6EF',
      notes: 'None',
      expectedVersion: 2,
    },
  );

  assert.equal(result.version, 3);
  assert.equal(result.name, 'Middlesbrough Hindu Temple');
  const transaction = calls.find((command) => command.constructor.name === 'TransactWriteCommand');
  const venuePut = transaction.input.TransactItems[0].Put;
  assert.equal(venuePut.Item.version, 3);
  assert.equal(
    venuePut.ConditionExpression,
    'attribute_exists(venueId) AND attribute_not_exists(#version) AND legacyPayload.#version=:expected',
  );
  assert.equal(venuePut.ExpressionAttributeValues[':expected'], 2);
});

test('final venue edit rejects a stale revision from the legacy projection', async () => {
  let writes = 0;
  const existing = {
    venueId: 'VENUE-MIDDLESBROUGH',
    institutionId: 'shared',
    legacyPayload: {
      id: 'VENUE-MIDDLESBROUGH',
      version: 3,
      name: 'Current venue name',
      location: 'Middlesbrough',
      address: 'Current address',
      postcode: 'TS1 1AA',
      notes: '',
    },
  };
  const db = {
    async send(command: any) {
      if (command.constructor.name === 'GetCommand') return { Item: existing };
      writes++;
      return {};
    },
  };
  const write = makeFinalVenueWriter(db);

  await assert.rejects(
    write(
      'raaga',
      { sub: 'raaga-admin', 'cognito:groups': ['raagasudha-admin'] },
      'VENUE-MIDDLESBROUGH',
      { name: 'Stale edit', expectedVersion: 2 },
    ),
    { status: 409, message: 'Venue changed. Refresh and retry.' },
  );
  assert.equal(writes, 0);
});

test('final venue create still rejects expectedVersion and unknown edit fields', async () => {
  const write = makeFinalVenueWriter({
    send: async () => {
      throw new Error('Must not write');
    },
  });
  const claims = { sub: 'sruti-admin', 'cognito:groups': ['sruti-admin'] };
  await assert.rejects(
    write('sruti', claims, undefined, {
      name: 'Hall',
      location: 'Middlesbrough',
      address: 'Main Street',
      expectedVersion: 1,
    }),
    { status: 400 },
  );
  await assert.rejects(
    write('sruti', claims, 'VENUE-MIDDLESBROUGH', { teacher: 'Someone', expectedVersion: 2 }),
    { status: 400 },
  );
});
