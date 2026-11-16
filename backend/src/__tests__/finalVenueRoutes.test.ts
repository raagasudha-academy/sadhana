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
  assert.equal(calls.filter((command) => command.constructor.name === 'TransactWriteCommand').length, 1);
});

test('final venue create still rejects expectedVersion and unknown edit fields', async () => {
  const write = makeFinalVenueWriter({ send: async () => { throw new Error('Must not write'); } });
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
