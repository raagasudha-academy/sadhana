import test from 'node:test';
import assert from 'node:assert/strict';
import { finalTeacherCreateRoute } from '../finalTeacherCreate.mjs';

const env = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_DATA_MODE: 'final',
  SADHANA_FINAL_CORE_WRITES: 'enabled',
};
const ctx = (method = 'POST', inst = 'raaga', claims = { sub: 'admin' }) => ({
  parts: ['teachers'],
  method,
  claims,
  query: { institution: inst },
  event: { body: '{}' },
});
const access = {
  admin(claims, inst) {
    if (inst !== 'raaga' || claims?.sub !== 'admin')
      throw Object.assign(new Error('academy denied'), { status: 403 });
  },
};
const deps = {
  assertConfigured() {},
  parse: () => ({
    displayName: ' Teacher One ',
    institutions: ['raaga'],
    subjects: ['Vocal'],
    aliases: [],
    cognitoSub: '',
    active: true,
  }),
  create: async () => ({ id: 'TEACHER-1' }),
};

test('POST reaches canonical creator and returns created record', async () => {
  assert.deepEqual(await finalTeacherCreateRoute(ctx(), deps, access, env), {
    status: 201,
    body: { record: { id: 'TEACHER-1' } },
  });
});
test('route checks canonical table configuration before parsing or writing', async () => {
  let called = false;
  await assert.rejects(
    () =>
      finalTeacherCreateRoute(
        ctx(),
        {
          ...deps,
          assertConfigured() {
            throw new Error('table blocked');
          },
          parse() {
            called = true;
            return {};
          },
        },
        access,
        env,
      ),
    /table blocked/,
  );
  assert.equal(called, false);
});
test('final acknowledgement, core-write flag, and admin permissions are required', async () => {
  assert.equal(
    (
      await finalTeacherCreateRoute(ctx(), deps, access, {
        ...env,
        SADHANA_ENTITY_FINAL_ACK: 'unset',
      })
    ).status,
    503,
  );
  assert.equal(
    (await finalTeacherCreateRoute(ctx(), deps, access, { ...env, SADHANA_FINAL_CORE_WRITES: '' }))
      .status,
    503,
  );
  await assert.rejects(
    () =>
      finalTeacherCreateRoute(
        ctx('POST', 'raaga', { sub: 'teacher', 'cognito:groups': ['raagasudha-viewer'] }),
        deps,
        access,
        env,
      ),
    /academy denied/,
  );
});
test('unauthenticated and malformed routes are rejected without calling creator', async () => {
  let called = 0;
  const never = {
    ...deps,
    create: async () => {
      called++;
      return {};
    },
  };
  assert.equal(
    (await finalTeacherCreateRoute(ctx('POST', 'raaga', null), never, access, env)).status,
    401,
  );
  assert.equal(
    (
      await finalTeacherCreateRoute(
        { ...ctx(), query: { institution: 'shared' } },
        never,
        access,
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await finalTeacherCreateRoute({ ...ctx(), parts: ['teachers', 'one'] }, never, access, env))
      .status,
    405,
  );
  assert.equal(called, 0);
});
test('legacy mode leaves POST handling untouched', async () =>
  assert.equal(
    await finalTeacherCreateRoute(ctx(), deps, access, { SADHANA_ENTITY_TABLE_SET: 'm9' }),
    undefined,
  ));
