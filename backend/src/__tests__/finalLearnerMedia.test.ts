import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { makeM10FinalLearnerMedia } from '../finalLearnerMedia.ts';

const keys = [
  'SADHANA_ENTITY_STAGE',
  'SADHANA_ENTITY_TABLE_SET',
  'SADHANA_DATA_MODE',
  'SADHANA_ENTITY_FINAL_ACK',
] as const;
let previous: string[];
before(() => {
  previous = keys.map((k) => process.env[k] ?? '\0');
  process.env.SADHANA_ENTITY_STAGE = 'test';
  process.env.SADHANA_ENTITY_TABLE_SET = 'm9';
  delete process.env.SADHANA_DATA_MODE;
  delete process.env.SADHANA_ENTITY_FINAL_ACK;
});
after(() =>
  keys.forEach((k, i) =>
    previous[i] === '\0' ? delete process.env[k] : (process.env[k] = previous[i]),
  ),
);

test('practice audio upload must reference an existing practice entry for that learner and academy', async () => {
  const calls: any[] = [];
  const service = makeM10FinalLearnerMedia(
    {
      send: async (command: any) => {
        calls.push(command);
        if (command instanceof GetCommand && command.input.TableName.endsWith('-practice'))
          return command.input.Key.practiceId === 'PRACTICE-1001'
            ? {
                Item: {
                  practiceId: 'PRACTICE-1001',
                  institutionId: 'raaga',
                  studentId: 'STUDENT-1001',
                },
              }
            : {};
        if (command instanceof TransactWriteCommand) return {};
        throw new Error(`Unexpected ${command.constructor.name}`);
      },
    },
    {
      head: async () => ({}),
      signPut: async (_bucket, key) => `put:${key}`,
      signGet: async () => '',
    },
    async (inst, claims, id) => ({
      actor: { personId: 'STUDENT-1001' },
      student: { personId: id },
      link: null,
    }),
  );
  await assert.rejects(
    service.start('raaga', { sub: 'student-sub' }, 'STUDENT-1001', {
      mime: 'audio/mpeg',
      size: 10,
      purpose: 'practice',
    }),
    { status: 400 },
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    service.start('raaga', { sub: 'student-sub' }, 'STUDENT-1001', {
      mime: 'audio/mpeg',
      size: 10,
      purpose: 'practice',
      practiceId: 'PRACTICE-OTHER',
    }),
    { status: 404 },
  );
  assert.equal(calls.filter((x) => x instanceof TransactWriteCommand).length, 0);
  const previousBucket = process.env.SADHANA_LEARNER_MEDIA_BUCKET;
  process.env.SADHANA_LEARNER_MEDIA_BUCKET = 'private-media';
  try {
    const result = await service.start('raaga', { sub: 'student-sub' }, 'STUDENT-1001', {
      mime: 'audio/mpeg',
      size: 10,
      purpose: 'practice',
      practiceId: 'PRACTICE-1001',
    });
    assert.match(result.key, /homework-private\/learner\/raaga\/STUDENT-1001\/LEARNERMEDIA-/);
    const write = calls.find((x) => x instanceof TransactWriteCommand).input.TransactItems;
    const receipt = write.find((x: any) => x.Put?.TableName.endsWith('-submissions')).Put.Item;
    assert.equal(receipt.practiceId, 'PRACTICE-1001');
    assert.equal(receipt.purpose, 'practice');
  } finally {
    if (previousBucket === undefined) delete process.env.SADHANA_LEARNER_MEDIA_BUCKET;
    else process.env.SADHANA_LEARNER_MEDIA_BUCKET = previousBucket;
  }
});

test('practice recording rejects video and files above the audio limit', async () => {
  const service = makeM10FinalLearnerMedia(
    {
      send: async () => {
        throw new Error('unexpected database call');
      },
    },
    undefined as any,
    async () => ({
      actor: { personId: 'STUDENT-1001' },
      student: { personId: 'STUDENT-1001' },
      link: null,
    }),
  );
  await assert.rejects(
    service.start('raaga', { sub: 'student-sub' }, 'STUDENT-1001', {
      mime: 'video/mp4',
      size: 100,
      purpose: 'practice',
      practiceId: 'PRACTICE-1001',
    }),
    { status: 400 },
  );
  await assert.rejects(
    service.start('raaga', { sub: 'student-sub' }, 'STUDENT-1001', {
      mime: 'audio/mpeg',
      size: 20_000_001,
      purpose: 'practice',
      practiceId: 'PRACTICE-1001',
    }),
    { status: 400 },
  );
});
