import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM10RegistrationCutoverRoutes } from '../routes/registrationCutoverRoutes.ts';

const sruti = { sub: 'sruti-admin-test', 'cognito:groups': ['sruti-admin'] };
const raaga = { sub: 'raaga-admin-test', 'cognito:groups': ['raagasudha-admin'] };
const reader = { list: async () => ({ items: [], more: false }), get: async () => null };
const dummyReview = async () => ({ statusCode: 503, headers: {}, body: '{}' });
const ctx = (part: string[], institution: string, claims: any = sruti, body = '{}') =>
  ({
    parts: part,
    method: 'POST',
    query: { institution },
    claims,
    groups: [],
    inst: institution,
    event: { body },
  }) as any;
const id = 'SR-2026-4D6401';
const path = (action: string) => ['website-registrations', id, action];
const unpack = (result: any) => JSON.parse(result.body);

test('Sruti import preview is read-only, institution scoped and independent of broad onboarding flags', async () => {
  const prior = process.env.M95_ONBOARDING_MODE;
  process.env.M95_ONBOARDING_MODE = 'disabled';
  const calls: any[] = [];
  const route = makeM10RegistrationCutoverRoutes(
    reader as any,
    dummyReview as any,
    (async (...args: any[]) => {
      calls.push(args);
      return {
        preview: true,
        readyForExecute: true,
        registrationId: id,
        studentCount: 2,
        guardianApprovalPending: true,
      };
    }) as any,
  );
  try {
    const result = await route(ctx(path('import-preview'), 'sruti'));
    assert.equal(result?.statusCode, 200);
    assert.equal(unpack(result).studentCount, 2);
    assert.deepEqual(
      calls.map((x) => [x[0], x[2], x[3], x[4], x[5]]),
      [['sruti', id, false, 'fresh', true]],
    );
    await assert.rejects(
      route(ctx(path('import-preview'), 'sruti', raaga)),
      (e: any) => e.status === 403,
    );
    assert.equal(calls.length, 1);
    assert.equal(
      await route(ctx(['website-registrations', 'RS-1', 'import-preview'], 'raaga', raaga)),
      undefined,
    );
  } finally {
    if (prior === undefined) delete process.env.M95_ONBOARDING_MODE;
    else process.env.M95_ONBOARDING_MODE = prior;
  }
});

test('Sruti execute remains disabled without dedicated import switch', async () => {
  const prior = process.env.M91_SRUTI_IMPORT_WRITES;
  delete process.env.M91_SRUTI_IMPORT_WRITES;
  let called = false;
  const route = makeM10RegistrationCutoverRoutes(
    reader as any,
    dummyReview as any,
    (async () => {
      called = true;
      return { imported: true };
    }) as any,
  );
  try {
    const result = await route(
      ctx(path('import-execute'), 'sruti', sruti, JSON.stringify({ confirmReference: id })),
    );
    assert.equal(result?.statusCode, 503);
    assert.equal(called, false);
  } finally {
    if (prior !== undefined) process.env.M91_SRUTI_IMPORT_WRITES = prior;
  }
});

test('Sruti execute validates exact confirmation and rejects malformed requests before import', async () => {
  const prior = process.env.M91_SRUTI_IMPORT_WRITES;
  process.env.M91_SRUTI_IMPORT_WRITES = 'enabled';
  let calls = 0;
  const route = makeM10RegistrationCutoverRoutes(
    reader as any,
    dummyReview as any,
    (async () => {
      calls++;
      return { imported: true };
    }) as any,
  );
  try {
    for (const body of [
      '{}',
      JSON.stringify({ confirmReference: 'RS-1' }),
      JSON.stringify({ confirmReference: id, grantGuardianAccess: true }),
    ]) {
      await assert.rejects(
        route(ctx(path('import-execute'), 'sruti', sruti, body)),
        (e: any) => e.status === 400,
      );
    }
    await assert.rejects(
      route(ctx(['website-registrations', 'NOT-AN-ID', 'import-preview'], 'sruti')),
      (e: any) => e.status === 400,
    );
    await assert.rejects(
      route(ctx(path('import-execute'), 'sruti', raaga, JSON.stringify({ confirmReference: id }))),
      (e: any) => e.status === 403,
    );
    assert.equal(calls, 0);
    const result = await route(
      ctx(path('import-execute'), 'sruti', sruti, JSON.stringify({ confirmReference: id })),
    );
    assert.equal(result?.statusCode, 200);
    assert.equal(calls, 1);
  } finally {
    if (prior === undefined) delete process.env.M91_SRUTI_IMPORT_WRITES;
    else process.env.M91_SRUTI_IMPORT_WRITES = prior;
  }
});

test('Sruti POST cannot use arbitrary legacy actions', async () => {
  const route = makeM10RegistrationCutoverRoutes(
    reader as any,
    dummyReview as any,
    (async () => {
      throw new Error('should not run');
    }) as any,
  );
  assert.equal((await route(ctx(path('import'), 'sruti')))?.statusCode, 503);
});
