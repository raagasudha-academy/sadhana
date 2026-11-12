import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFinalFamilyContactRoute } from '../finalFamilyContact.ts';
import { makeM10CoreDirectoryReader } from '../coreDirectory.ts';

const context = (overrides: any = {}) => ({
  parts: ['families', 'fam_example_005', 'contact'],
  method: 'GET',
  inst: 'raaga',
  query: { institution: 'raaga' },
  claims: { sub: 'admin-sub', 'cognito:groups': ['raagasudha-admin'] },
  event: {},
  groups: ['raaga'],
  ...overrides,
});
const familyContact = {
  familyId: 'fam_example_005',
  parentName: 'Parent Example',
  email: 'parent@example.org',
  phone: '+447700900123',
  location: 'Middlesbrough',
  address: { town: 'Middlesbrough' },
};
const flags = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_DATA_MODE: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
} as NodeJS.ProcessEnv;

test('final family contact route returns the canonical parent email and details', async () => {
  const reads: string[] = [];
  const reader = makeM10CoreDirectoryReader({
    send: async (command: any) => {
      reads.push(command.input.TableName);
      if (command.input.TableName.endsWith('families'))
        return {
          Item: {
            familyId: 'fam_example_005',
            status: 'active',
            institutionIds: ['raaga'],
            primaryContactPersonId: 'per_example_parent',
            email: 'parent@example.org',
            location: 'Middlesbrough',
          },
        };
      return {
        Item: {
          personId: 'per_example_parent',
          familyId: 'fam_example_005',
          status: 'active',
          institutionIds: ['raaga'],
          personTypes: ['guardian', 'student'],
          firstName: 'Parent',
          lastName: 'Example',
          email: 'parent@example.org',
          phone: '+447700900123',
        },
      };
    },
  } as any);
  const route = makeFinalFamilyContactRoute(() => reader, flags);
  const response = await route(context() as any);
  assert.equal(response?.statusCode, 200);
  assert.equal(JSON.parse(response!.body).email, 'parent@example.org');
  assert.equal(reads.length, 2);
});

test('final family contact route enforces academy administrator access before reading', async () => {
  let reads = 0;
  const route = makeFinalFamilyContactRoute(
    () =>
      ({
        familyContact: async () => {
          reads++;
          return familyContact;
        },
      }) as any,
    flags,
  );
  await assert.rejects(
    () =>
      route(context({ claims: { sub: 'other-admin', 'cognito:groups': ['sruti-admin'] } }) as any),
    (e: any) => e.status === 403,
  );
  assert.equal(reads, 0);
});

test('final family contact route stays closed when final tables are not authorised', async () => {
  let reads = 0;
  const route = makeFinalFamilyContactRoute(
    () =>
      ({
        familyContact: async () => {
          reads++;
          return familyContact;
        },
      }) as any,
    { ...flags, SADHANA_ENTITY_FINAL_ACK: 'disabled' },
  );
  await assert.rejects(
    () => route(context() as any),
    (e: any) => e.status === 503,
  );
  assert.equal(reads, 0);
});
