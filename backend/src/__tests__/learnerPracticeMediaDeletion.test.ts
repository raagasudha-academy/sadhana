import test from 'node:test';
import assert from 'node:assert/strict';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { makeM9LearnerWrites } from '../learnerWrites.ts';

test('learner may remove only their unreviewed practice media and advances the practice version', async () => {
  const envKeys = [
    'SADHANA_ENTITY_STAGE',
    'SADHANA_ENTITY_TABLE_SET',
    'SADHANA_FINAL_LEARNER_WRITES',
    'M9_LEARNER_WRITES',
    'SADHANA_LEARNER_MEDIA_BUCKET',
  ] as const;
  const previous = envKeys.map((key) => process.env[key]);
  process.env.SADHANA_ENTITY_STAGE = 'test';
  process.env.SADHANA_ENTITY_TABLE_SET = 'm9';
  process.env.M9_LEARNER_WRITES = 'enabled';
  process.env.SADHANA_LEARNER_MEDIA_BUCKET = 'private-test-media';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const actor = {
    personId: 'STUDENT-1001',
    cognitoSub: 'student-sub',
    status: 'active',
    institutionIds: ['raaga'],
    personTypes: ['student'],
    studentProfile: { rollNumbers: { raaga: 'RS-1001' } },
  };
  const practice = {
    practiceId: 'PRACTICE-1001',
    institutionId: 'raaga',
    studentId: actor.personId,
    practiceDate: today,
    version: 3,
  };
  const objectKey =
    'homework-private/learner/raaga/STUDENT-1001/LEARNERMEDIA-12345678-1234-4234-8234-123456789abc.mp3';
  const receipt = {
    submissionId: 'LEARNERMEDIA-12345678-1234-4234-8234-123456789abc',
    recordType: 'learner-media',
    institutionId: 'raaga',
    studentId: actor.personId,
    purpose: 'practice',
    practiceId: practice.practiceId,
    mediaStatus: 'ready',
    objectKey,
  };
  const writes: TransactWriteCommand[] = [];
  const deletes: Array<{ bucket: string; key: string }> = [];
  const service = makeM9LearnerWrites(
    {
      send: async (command: any) => {
        if (command instanceof QueryCommand) return { Items: [actor] };
        if (command instanceof GetCommand) {
          const table = command.input.TableName;
          if (table.endsWith('-people')) return { Item: actor };
          if (table.endsWith('-practice')) return { Item: practice };
          if (table.endsWith('-submissions')) return { Item: receipt };
        }
        if (command instanceof TransactWriteCommand) {
          writes.push(command);
          return {};
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      },
    },
    undefined,
    undefined,
    async (bucket, key) => {
      deletes.push({ bucket, key });
    },
  );

  try {
    const result = await service.deletePracticeMedia(
      'raaga',
      { sub: actor.cognitoSub },
      actor.personId,
      practice.practiceId,
      receipt.submissionId,
      { expectedVersion: practice.version },
    );
    assert.deepEqual(result, { deleted: true, cleanupPending: false, version: 4 });
    assert.deepEqual(deletes, [{ bucket: 'private-test-media', key: objectKey }]);
    const items = writes[0].input.TransactItems;
    assert.equal(
      items.some((item: any) => item.Update?.TableName.endsWith('-practice')),
      true,
    );
    assert.equal(
      items.some((item: any) => item.Delete?.TableName.endsWith('-submissions')),
      true,
    );
    assert.equal(
      items.some((item: any) => item.Put?.Item?.action === 'studentPracticeMediaDelete'),
      true,
    );
  } finally {
    envKeys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
