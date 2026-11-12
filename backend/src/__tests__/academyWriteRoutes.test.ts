import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM10AcademyWriteRoutes } from '../routes/academyWriteRoutes.ts';

const claims = { sub: 'test-admin', 'cognito:groups': ['raagasudha-admin'] };
const context = (
  parts: string[],
  method: string,
  body: unknown,
  inst: 'raaga' | 'sruti' = 'raaga',
) => ({
  parts,
  method,
  inst,
  claims,
  event: { body: JSON.stringify(body) },
  query: { institution: inst },
  groups: ['raaga' as const],
});
const env = (core: string | undefined, writer: string | undefined, run: () => Promise<void>) => {
  const previous = [process.env.M10_ACADEMY_CORE_WRITES, process.env.M9_TARGET_REPOSITORY_WRITES];
  if (core === undefined) delete process.env.M10_ACADEMY_CORE_WRITES;
  else process.env.M10_ACADEMY_CORE_WRITES = core;
  if (writer === undefined) delete process.env.M9_TARGET_REPOSITORY_WRITES;
  else process.env.M9_TARGET_REPOSITORY_WRITES = writer;
  return run().finally(() => {
    for (const [i, k] of ['M10_ACADEMY_CORE_WRITES', 'M9_TARGET_REPOSITORY_WRITES'].entries()) {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    }
  });
};
test('M10 endpoint is closed by default and never calls writer', async () => {
  let calls = 0;
  const route = makeM10AcademyWriteRoutes(
    () =>
      ({
        create: async () => {
          calls++;
          return {};
        },
        update: async () => {
          calls++;
          return {};
        },
      }) as any,
  );
  await env(undefined, 'enabled', async () => {
    const r = await route(
      context(['m10-academy', 'classes'], 'POST', {
        classId: 'ABC',
        institutionId: 'raaga',
        name: 'Class',
      }) as any,
    );
    assert.equal(r?.statusCode, 503);
  });
  assert.equal(calls, 0);
});
test('M10 denies cross institution before M9 writes', async () => {
  let calls = 0;
  const route = makeM10AcademyWriteRoutes(
    () =>
      ({
        create: async () => {
          calls++;
          return {};
        },
        update: async () => {
          calls++;
          return {};
        },
      }) as any,
  );
  await env('enabled', 'enabled', async () => {
    await assert.rejects(
      () =>
        route(
          context(
            ['m10-academy', 'classes'],
            'POST',
            { classId: 'ABC', institutionId: 'sruti', name: 'Class' },
            'sruti',
          ) as any,
        ),
      { status: 403 },
    );
  });
  assert.equal(calls, 0);
});
test('M10 uses M9 writer for validated institution-scoped class updates', async () => {
  const calls: any[] = [];
  const route = makeM10AcademyWriteRoutes(
    () =>
      ({
        create: async (...args: any[]) => {
          calls.push(args);
          return { classId: 'CLS-1' };
        },
        update: async (...args: any[]) => {
          calls.push(args);
          return { classId: 'CLS-1', version: 2 };
        },
      }) as any,
  );
  await env('enabled', 'enabled', async () => {
    const created = await route(
      context(['m10-academy', 'classes'], 'POST', {
        classId: 'CLS-1',
        institutionId: 'raaga',
        name: 'Class',
      }) as any,
    );
    assert.equal(created?.statusCode, 201);
    const changed = await route(
      context(['m10-academy', 'classes', 'CLS-1'], 'PATCH', {
        expectedVersion: 1,
        changes: { name: 'New' },
      }) as any,
    );
    assert.equal(changed?.statusCode, 200);
    const denied = await route(
      context(['m10-academy', 'classes', 'CLS-1'], 'PATCH', {
        expectedVersion: 1,
        changes: { institutionId: 'sruti' },
      }) as any,
    );
    assert.equal(denied?.statusCode, 400);
  });
  assert.deepEqual(calls[1], ['classes', 'CLS-1', 1, { name: 'New' }, 'raaga']);
});
test('M10 venue create and update use the same scoped writer contract', async () => {
  const calls: any[] = [];
  const route = makeM10AcademyWriteRoutes(
    () =>
      ({
        create: async (...args: any[]) => {
          calls.push(['create', ...args]);
          return { venueId: 'VEN-1' };
        },
        update: async (...args: any[]) => {
          calls.push(['update', ...args]);
          return { venueId: 'VEN-1', version: 2 };
        },
      }) as any,
  );
  await env('enabled', 'enabled', async () => {
    const created = await route(
      context(['m10-academy', 'venues'], 'POST', {
        venueId: 'VEN-1',
        institutionId: 'raaga',
        name: 'Hall',
      }) as any,
    );
    assert.equal(created?.statusCode, 201);
    const changed = await route(
      context(['m10-academy', 'venues', 'VEN-1'], 'PATCH', {
        expectedVersion: 1,
        changes: { name: 'Main Hall' },
      }) as any,
    );
    assert.equal(changed?.statusCode, 200);
  });
  assert.deepEqual(calls, [
    ['create', 'venues', { venueId: 'VEN-1', institutionId: 'raaga', name: 'Hall' }],
    ['update', 'venues', 'VEN-1', 1, { name: 'Main Hall' }, 'raaga'],
  ]);
});
