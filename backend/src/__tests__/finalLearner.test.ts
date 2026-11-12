import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM9FinalLearner } from '../finalLearner.ts';
const actor = {
  personId: 'per_parent',
  cognitoSub: 'sub123',
  institutionIds: ['raaga'],
  status: 'active',
  personTypes: ['guardian'],
};
const student = {
  personId: 'per_student',
  displayName: 'Example Student',
  institutionIds: ['raaga'],
  status: 'active',
  personTypes: ['student'],
  studentProfile: { rollNumbers: { raaga: '001-001' } },
};
const verified = {
  linkId: 'link1',
  guardianPersonId: 'per_parent',
  studentId: 'per_student',
  institutionId: 'raaga',
  accessStatus: 'approved',
  relationshipVerified: true,
};
function fake(status: 'approved' | 'revoked' = 'approved') {
  const commands: any[] = [];
  const client = {
    send: async (command: any) => {
      commands.push(command);
      const x = command.input;
      if (command.constructor.name === 'QueryCommand') {
        switch (x.IndexName) {
          case 'CognitoIdentityIndex':
            return { Items: [actor] };
          case 'GuardianAccessIndex':
            return { Items: [verified] };
          case 'StudentEnrolmentsIndex':
            return {
              Items: [
                {
                  enrolmentId: 'enr1',
                  studentId: 'per_student',
                  classId: 'cls1',
                  institutionId: 'raaga',
                  status: 'active',
                  startDate: '2026-01-01',
                },
              ],
            };
          case 'ClassSessionsIndex':
            return {
              Items: [
                {
                  sessionId: 'ses1',
                  classId: 'cls1',
                  institutionId: 'raaga',
                  recordType: 'class-session',
                  localDate: '2026-11-05',
                  localStartTime: '10:00',
                },
              ],
            };
          default:
            return { Items: [] };
        }
      }
      if (command.constructor.name === 'GetCommand') {
        if (x.TableName.endsWith('-people'))
          return { Item: x.Key.personId === 'per_parent' ? actor : student };
        if (x.TableName.endsWith('-family-links'))
          return { Item: { ...verified, accessStatus: status } };
        if (x.TableName.endsWith('-classes'))
          return { Item: { classId: 'cls1', institutionId: 'raaga', name: 'Existing Class' } };
      }
      return {};
    },
  };
  return { commands, client };
}
test('M9 learner dashboard returns academy-scoped timetable after independently approved link', async () => {
  const prev = process.env.M9_FINAL_LEARNER_READS;
  process.env.M9_FINAL_LEARNER_READS = 'enabled';
  try {
    const { client } = fake();
    const d = await makeM9FinalLearner(client).dashboard('raaga', { sub: 'sub123' }, 'per_student');
    assert.equal(d.student.id, 'per_student');
    assert.equal(d.classes.length, 1);
    assert.equal(d.calendarSessions.length, 1);
  } finally {
    if (prev === undefined) delete process.env.M9_FINAL_LEARNER_READS;
    else process.env.M9_FINAL_LEARNER_READS = prev;
  }
});
test('M9 learner dashboard rejects revoked guardian permission despite stale index data', async () => {
  const prev = process.env.M9_FINAL_LEARNER_READS;
  process.env.M9_FINAL_LEARNER_READS = 'enabled';
  try {
    const { client, commands } = fake('revoked');
    await assert.rejects(
      makeM9FinalLearner(client).dashboard('raaga', { sub: 'sub123' }, 'per_student'),
      /verified guardian/,
    );
    assert.equal(
      commands.some((x) => x.input?.TableName === 'sadhana-dev-m9-enrolments'),
      false,
    );
  } finally {
    if (prev === undefined) delete process.env.M9_FINAL_LEARNER_READS;
    else process.env.M9_FINAL_LEARNER_READS = prev;
  }
});
test('M9 learner feature flag prevents all database reads', async () => {
  const prev = process.env.M9_FINAL_LEARNER_READS;
  delete process.env.M9_FINAL_LEARNER_READS;
  try {
    const { client, commands } = fake();
    await assert.rejects(
      makeM9FinalLearner(client).dashboard('raaga', { sub: 'sub123' }, 'per_student'),
      /disabled/,
    );
    assert.equal(commands.length, 0);
  } finally {
    if (prev !== undefined) process.env.M9_FINAL_LEARNER_READS = prev;
  }
});
