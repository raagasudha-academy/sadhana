import test from 'node:test';
import assert from 'node:assert/strict';
import { finalMessagesRoute } from '../finalMessages.mjs';

const env = {
  SADHANA_ENTITY_TABLE_SET: 'final',
  SADHANA_ENTITY_FINAL_ACK: 'enabled',
  SADHANA_DATA_MODE: 'off',
};
const claims = { sub: 'teacher-sub' };
const calls = [];
const service = {
  contacts: async (...args) => (calls.push(['contacts', ...args]), { records: [] }),
  threads: async (...args) => (calls.push(['threads', ...args]), { records: [] }),
  thread: async (...args) => (calls.push(['thread', ...args]), { records: [] }),
  send: async (...args) => (calls.push(['send', ...args]), { record: { id: 'MESSAGE-1' } }),
  markRead: async (...args) => (calls.push(['markRead', ...args]), { updated: 1 }),
};
const deps = {
  assertConfigured: () => calls.push(['configured']),
  service: () => service,
  permittedInstitutions: (who) => who.adminInstitutions || [],
  parse: (event) => JSON.parse(event.body || '{}'),
};
const ctx = (parts, method = 'GET', body = {}, query = { institution: 'sruti' }, who = claims) => ({
  parts,
  method,
  claims: who,
  query,
  inst: query.institution,
  event: { body: JSON.stringify(body) },
});
const run = (
  parts,
  method = 'GET',
  body = {},
  query = { institution: 'sruti' },
  who = claims,
  configured = env,
) => finalMessagesRoute(ctx(parts, method, body, query, who), deps, configured);

test('messages route is final-mode only and requires final acknowledgement and authentication', async () => {
  calls.length = 0;
  assert.equal(
    await run(['messages', 'threads'], 'GET', {}, undefined, claims, {
      ...env,
      SADHANA_ENTITY_TABLE_SET: 'm9',
    }),
    undefined,
  );
  assert.equal(
    (
      await run(['messages', 'threads'], 'GET', {}, undefined, claims, {
        ...env,
        SADHANA_ENTITY_FINAL_ACK: '',
      })
    ).status,
    503,
  );
  assert.equal((await run(['messages', 'threads'], 'GET', {}, undefined, {})).status, 401);
  assert.deepEqual(calls, []);
});

test('contacts and thread reads validate route and call scoped services', async () => {
  calls.length = 0;
  assert.equal((await run(['messages', 'contacts'])).status, 200);
  assert.equal((await run(['messages', 'threads'])).status, 200);
  const threadId = 'a'.repeat(64);
  assert.equal(
    (
      await run(
        ['messages', 'threads', threadId],
        'GET',
        {},
        { institution: 'sruti', peerId: 'PERSON-STUDENT', classId: 'CLASS-SRUTI' },
      )
    ).status,
    200,
  );
  assert.deepEqual(
    calls.filter((x) => ['contacts', 'threads', 'thread'].includes(x[0])).map((x) => x[0]),
    ['contacts', 'threads', 'thread'],
  );
  assert.equal(
    (
      await run(
        ['messages', 'threads', 'bad'],
        'GET',
        {},
        { institution: 'sruti', peerId: 'PERSON-STUDENT', classId: 'CLASS-SRUTI' },
      )
    ).status,
    404,
  );
});

test('start, reply and mark-read payloads use explicit participant and class fields', async () => {
  calls.length = 0;
  const threadId = 'b'.repeat(64);
  assert.equal(
    (
      await run(['messages'], 'POST', {
        peerId: 'PERSON-STUDENT',
        classId: 'CLASS-SRUTI',
        text: 'Hello',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await run(['messages', 'threads', threadId], 'POST', {
        peerId: 'PERSON-STUDENT',
        classId: 'CLASS-SRUTI',
        text: 'Again',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await run(['messages', 'threads', threadId, 'read'], 'POST', {
        peerId: 'PERSON-STUDENT',
        classId: 'CLASS-SRUTI',
      })
    ).status,
    200,
  );
  assert.deepEqual(
    calls.filter((x) => ['send', 'markRead'].includes(x[0])).map((x) => x[0]),
    ['send', 'send', 'markRead'],
  );
  assert.equal(
    (
      await run(['messages'], 'POST', {
        peerId: 'PERSON-STUDENT',
        classId: 'CLASS-SRUTI',
        text: 'hello',
        studentId: 'bad!',
      })
    ).status,
    400,
  );
});

test('View As may pass a selected student only as explicit context, with route validation', async () => {
  calls.length = 0;
  const threadId = 'c'.repeat(64),
    studentId = 'PERSON-STUDENT';
  assert.equal(
    (
      await run(
        ['messages', 'contacts'],
        'GET',
        {},
        { institution: 'sruti', studentId },
        { sub: 'guardian-sub' },
      )
    ).status,
    200,
  );
  assert.deepEqual(calls.find((x) => x[0] === 'contacts').slice(1), [
    'sruti',
    { sub: 'guardian-sub' },
    [],
    studentId,
  ]);
  assert.equal(
    (
      await run(
        ['messages'],
        'POST',
        { peerId: 'PERSON-TEACHER', classId: 'CLASS-SRUTI', text: 'Hello', studentId },
        { institution: 'sruti' },
        { sub: 'guardian-sub' },
      )
    ).status,
    201,
  );
  assert.deepEqual(calls.find((x) => x[0] === 'send').slice(1), [
    'sruti',
    { sub: 'guardian-sub' },
    'PERSON-TEACHER',
    'CLASS-SRUTI',
    undefined,
    { text: 'Hello' },
    [],
    studentId,
  ]);
  assert.equal(
    (
      await run(
        ['messages', 'contacts'],
        'GET',
        {},
        { institution: 'sruti', studentId: 'bad!' },
        { sub: 'guardian-sub' },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await run(
        ['messages'],
        'POST',
        { peerId: 'PERSON-TEACHER', classId: 'CLASS-SRUTI', text: 'Hello', studentId: 'bad!' },
        { institution: 'sruti' },
        { sub: 'guardian-sub' },
      )
    ).status,
    400,
  );
});

test('admin authority is scoped to the institutions in the verified claims', async () => {
  calls.length = 0;
  assert.equal(
    (
      await run(
        ['messages', 'contacts'],
        'GET',
        {},
        { institution: 'sruti' },
        { sub: 'admin-sub', adminInstitutions: ['sruti'] },
      )
    ).status,
    200,
  );
  assert.deepEqual(calls.find((x) => x[0] === 'contacts').slice(1), [
    'sruti',
    { sub: 'admin-sub', adminInstitutions: ['sruti'] },
    ['sruti'],
    undefined,
  ]);
  assert.equal(
    (
      await run(
        ['messages', 'contacts'],
        'GET',
        {},
        { institution: 'raaga' },
        { sub: 'admin-sub', adminInstitutions: ['sruti'] },
      )
    ).status,
    200,
  );
  assert.deepEqual(
    calls
      .filter((x) => x[0] === 'contacts')
      .at(-1)
      .slice(3),
    [['sruti'], undefined],
  );
});
