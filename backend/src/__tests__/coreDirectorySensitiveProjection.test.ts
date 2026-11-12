import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM10CoreDirectoryReader } from '../coreDirectory.ts';
import { makeM10CoreDirectoryAuthoritativeRoutes } from '../routes/coreDirectoryAuthoritativeRoutes.ts';

const admin = { sub: 'admin-sub', 'cognito:groups': ['raagasudha-admin'] };
const context = (entity: 'students' | 'families') =>
  ({
    parts: [entity],
    method: 'GET',
    inst: 'raaga',
    query: { institution: 'raaga' },
    claims: admin,
    event: {},
    groups: ['raaga'],
  }) as any;
async function withFlags(fn: () => Promise<void>) {
  const keys = ['M10_CORE_DIRECTORY_ROUTING', 'M9_TARGET_REPOSITORY_ENABLED'] as const;
  const prior = keys.map((k) => process.env[k]);
  process.env.M10_CORE_DIRECTORY_ROUTING = 'enabled';
  process.env.M9_TARGET_REPOSITORY_ENABLED = 'read-only';
  try {
    await fn();
  } finally {
    keys.forEach((k, i) =>
      prior[i] === undefined ? delete process.env[k] : (process.env[k] = prior[i]),
    );
  }
}

test('admin student list returns only the supported compatibility fields', async () =>
  withFlags(async () => {
    const calls: any[] = [];
    const reader = makeM10CoreDirectoryReader({
      send: async (command: any) => {
        calls.push(command);
        return {
          Items: [
            {
              personId: 'PERSON-1',
              personTypes: ['student'],
              institutionIds: ['raaga'],
              familyId: 'FAMILY-1',
              firstName: 'Student',
              lastName: 'Example',
              phone: '+447700900123',
              email: 'private@example.org',
              cognitoSub: 'private-sub',
              dateOfBirth: '2012-01-01',
              address: { line1: 'Private address' },
              learnerPreferences: { about: 'private profile' },
              status: 'active',
              version: 3,
              studentProfile: { rollNumbers: { raaga: 'RS-001' }, medicalNotes: 'private note' },
            },
          ],
        };
      },
    } as any);
    const route = makeM10CoreDirectoryAuthoritativeRoutes(() => reader as any);
    const response = await route(context('students'));
    assert.equal(response?.statusCode, 200);
    const body = JSON.parse(response!.body);
    assert.deepEqual(body.records, [
      {
        id: 'PERSON-1',
        name: 'Student Example',
        phone: '+447700900123',
        familyId: 'FAMILY-1',
        createdIn: 'raaga',
        visibleIn: ['raaga'],
        archived: false,
        version: 3,
        registrationType: 'family',
        adultConfirmed: false,
        rollNumber: 'RS-001',
      },
    ]);
    assert.equal(JSON.stringify(body).includes('private@example.org'), false);
    assert.equal(JSON.stringify(body).includes('private-sub'), false);
    assert.equal(JSON.stringify(body).includes('2012-01-01'), false);
    assert.equal(calls.length, 1);
  }));

test('admin family list joins scoped contact but omits its private identity attributes', async () =>
  withFlags(async () => {
    const calls: any[] = [];
    const reader = makeM10CoreDirectoryReader({
      send: async (command: any) => {
        calls.push(command);
        if (command.input.TableName.endsWith('families'))
          return {
            Items: [
              {
                familyId: 'FAMILY-1',
                institutionIds: ['raaga'],
                primaryContactPersonId: 'GUARDIAN-1',
                familyNumber: 'F-001',
                status: 'active',
                version: 2,
                notes: 'private family note',
              },
            ],
          };
        return {
          Items: [
            {
              personId: 'GUARDIAN-1',
              institutionIds: ['raaga'],
              firstName: 'Guardian',
              lastName: 'Example',
              phone: '+447700900456',
              email: 'private@example.org',
              cognitoSub: 'private-sub',
              address: { line1: 'Private address' },
            },
          ],
        };
      },
    } as any);
    const route = makeM10CoreDirectoryAuthoritativeRoutes(() => reader as any);
    const response = await route(context('families'));
    assert.equal(response?.statusCode, 200);
    const body = JSON.parse(response!.body);
    assert.deepEqual(body.records, [
      {
        id: 'FAMILY-1',
        familyNumber: 'F-001',
        parentName: 'Guardian Example',
        phone: '+447700900456',
        createdIn: 'raaga',
        visibleIn: ['raaga'],
        archived: false,
        version: 2,
      },
    ]);
    assert.equal(JSON.stringify(body).includes('private@example.org'), false);
    assert.equal(JSON.stringify(body).includes('private-sub'), false);
    assert.equal(JSON.stringify(body).includes('Private address'), false);
    assert.equal(calls.length, 2);
  }));

test('wrong-academy and viewer identities are denied before core directory reads', async () =>
  withFlags(async () => {
    let reads = 0;
    const reader = {
      list: async () => {
        reads++;
        return { records: [], more: false };
      },
    };
    const route = makeM10CoreDirectoryAuthoritativeRoutes(() => reader as any);
    await assert.rejects(
      () =>
        route({
          ...context('students'),
          claims: { sub: 'sruti-admin', 'cognito:groups': ['sruti-admin'] },
        }),
      (e: any) => e.status === 403,
    );
    await assert.rejects(
      () =>
        route({
          ...context('families'),
          claims: { sub: 'viewer', 'cognito:groups': ['raagasudha-viewer'] },
        }),
      (e: any) => e.status === 403,
    );
    assert.equal(reads, 0);
  }));
