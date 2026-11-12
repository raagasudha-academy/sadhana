import test from 'node:test';
import assert from 'node:assert/strict';
import { finalCascadeDeletionRoute } from '../finalCascadeDeletion.mjs';
const env = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_DATA_MODE: 'final',
};
const context = (
  kind,
  body,
  claims = { sub: 'actor', 'cognito:groups': ['sadhana-super-admin'] },
) => ({
  parts: ['super-admin', 'deletions', kind],
  method: 'POST',
  claims,
  query: { institution: 'sruti' },
  event: { body: JSON.stringify(body) },
});
const deps = {
  isSuperAdmin: (c) => c?.['cognito:groups']?.includes('sadhana-super-admin'),
  parse: (e) => JSON.parse(e.body),
};
const target = { type: 'student', id: 'PERSON-12345', expectedVersion: 1 };
test('rejects non-Super Admin even when authenticated', async () =>
  assert.equal(
    (
      await finalCascadeDeletionRoute(
        context('preview', target, { sub: 'staff', 'cognito:groups': ['sruti-admin'] }),
        deps,
        env,
      )
    ).status,
    403,
  ));
test('does not fall through to legacy', async () =>
  assert.equal(
    (await finalCascadeDeletionRoute(context('preview', target), deps, env)).status,
    503,
  ));
test('execution requires signed preview and confirmation', async () =>
  assert.equal(
    (
      await finalCascadeDeletionRoute(
        context('execute', { ...target, confirm: 'DELETE', signature: 'abc' }),
        deps,
        env,
      )
    ).status,
    400,
  ));
test('service is invoked only for validated authorised requests', async () => {
  let calls = 0;
  const r = await finalCascadeDeletionRoute(
    context('preview', target),
    {
      ...deps,
      service: {
        preview: async () => {
          calls++;
          return {
            targetType: 'student',
            targetId: target.id,
            expectedVersion: 1,
            signature: 'x'.repeat(40),
            counts: [{ label: 'Student', count: 1 }],
            total: 1,
          };
        },
      },
    },
    env,
  );
  assert.equal(r.status, 200);
  assert.equal(calls, 1);
});
