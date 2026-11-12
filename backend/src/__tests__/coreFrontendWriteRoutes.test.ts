import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM10CoreFrontendWriteRoutes } from '../routes/coreFrontendWriteRoutes.ts';
const admin = { sub: 'admin-1', 'cognito:groups': 'raagasudha-admin' };
const other = { sub: 'admin-2', 'cognito:groups': 'sruti-admin' };
const base: any = {
  parts: ['families'],
  method: 'POST',
  inst: 'raaga',
  claims: admin,
  event: {
    body: JSON.stringify({ parentName: 'Guardian', phone: '+447700900111', createdIn: 'raaga' }),
  },
  query: { institution: 'raaga' },
  groups: ['raaga'],
};
const keys = [
  'M10_CORE_FRONTEND_WRITES',
  'M10_CORE_DIRECTORY_ROUTING',
  'M9_TARGET_REPOSITORY_ENABLED',
  'M9_TARGET_REPOSITORY_WRITES',
] as const;
async function flags(fn: () => Promise<void>) {
  const before = keys.map((k) => process.env[k]);
  try {
    process.env.M10_CORE_FRONTEND_WRITES = 'enabled';
    process.env.M10_CORE_DIRECTORY_ROUTING = 'enabled';
    process.env.M9_TARGET_REPOSITORY_ENABLED = 'read-only';
    process.env.M9_TARGET_REPOSITORY_WRITES = 'enabled';
    await fn();
  } finally {
    keys.forEach((k, i) =>
      before[i] === undefined ? delete process.env[k] : (process.env[k] = before[i]),
    );
  }
}
test('existing frontend POST family calls only M9 service', async () =>
  flags(async () => {
    const called: string[] = [];
    const route = makeM10CoreFrontendWriteRoutes(
      () =>
        ({
          create: async (entity: any, inst: any, claims: any, body: any) => {
            called.push(`${entity}:${inst}:${claims.sub}:${body.parentName}`);
            return { id: 'FAMILY-1' };
          },
          update: async () => {
            throw Error('not called');
          },
        }) as any,
    );
    const r = await route(base);
    assert.equal(r?.statusCode, 201);
    assert.deepEqual(JSON.parse(r!.body), { record: { id: 'FAMILY-1' } });
    assert.deepEqual(called, ['families:raaga:admin-1:Guardian']);
  }));
test('existing frontend PATCH student preserves version and route id', async () =>
  flags(async () => {
    const called: any[] = [];
    const route = makeM10CoreFrontendWriteRoutes(
      () =>
        ({
          create: async () => {
            throw Error('not called');
          },
          update: async (...args: any[]) => {
            called.push(args);
            return { id: 'PERSON-1', version: 2 };
          },
        }) as any,
    );
    const r = await route({
      ...base,
      parts: ['students', 'PERSON-1'],
      method: 'PATCH',
      event: { body: JSON.stringify({ expectedVersion: 1, name: 'Updated' }) },
    });
    assert.equal(r?.statusCode, 200);
    assert.equal(called[0][0], 'students');
    assert.equal(called[0][3], 'PERSON-1');
  }));
test('cross-institution admin denied before M9 data access', async () =>
  flags(async () => {
    let touched = false;
    const route = makeM10CoreFrontendWriteRoutes(
      () =>
        ({
          create: async () => {
            touched = true;
            return {};
          },
          update: async () => {
            touched = true;
            return {};
          },
        }) as any,
    );
    await assert.rejects(
      () => route({ ...base, claims: other }),
      (e: any) => e.status === 403,
    );
    assert.equal(touched, false);
  }));
test('authoritative reads block legacy write fallthrough when write flag missing', async () => {
  const prev = keys.map((k) => process.env[k]);
  try {
    process.env.M10_CORE_DIRECTORY_ROUTING = 'enabled';
    delete process.env.M10_CORE_FRONTEND_WRITES;
    const route = makeM10CoreFrontendWriteRoutes(() => ({
      create: async () => {
        throw Error('legacy attempted');
      },
      update: async () => {
        throw Error('legacy attempted');
      },
    }));
    assert.equal((await route(base))?.statusCode, 503);
  } finally {
    keys.forEach((k, i) =>
      prev[i] === undefined ? delete process.env[k] : (process.env[k] = prev[i]),
    );
  }
});
test('no root interception when both feature flags disabled', async () => {
  const prev = keys.map((k) => process.env[k]);
  try {
    delete process.env.M10_CORE_DIRECTORY_ROUTING;
    delete process.env.M10_CORE_FRONTEND_WRITES;
    const route = makeM10CoreFrontendWriteRoutes();
    assert.equal(await route(base), undefined);
  } finally {
    keys.forEach((k, i) =>
      prev[i] === undefined ? delete process.env[k] : (process.env[k] = prev[i]),
    );
  }
});
