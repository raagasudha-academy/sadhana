import test from 'node:test';
import assert from 'node:assert/strict';
import { makeM10FinalAttendanceWriter } from '../finalAttendanceWrite.ts';

const payload = { studentId: 'PERSON-1', sessionId: 'SESSION-1', status: 'present', note: '' };
const fixture = (existing: any[] = []) => {
  const sent: any[] = [];
  const db = {
    async send(command: any) {
      sent.push(command.input);
      const input = command.input;
      if (input.Key?.sessionId)
        return {
          Item: {
            sessionId: 'SESSION-1',
            institutionId: 'sruti',
            recordType: 'class-session',
            classId: 'CLASS-1',
            date: '2026-11-19',
            version: 3,
          },
        };
      if (input.Key?.personId)
        return {
          Item: {
            personId: 'PERSON-1',
            institutionIds: ['sruti'],
            personTypes: ['student'],
            status: 'active',
          },
        };
      if (input.Key?.classId)
        return {
          Item: {
            classId: 'CLASS-1',
            institutionId: 'sruti',
            recordType: 'class',
            status: 'active',
          },
        };
      if (input.IndexName === 'StudentEnrolmentsIndex')
        return {
          Items: [
            {
              enrolmentId: 'ENROL-1',
              institutionId: 'sruti',
              studentId: 'PERSON-1',
              classId: 'CLASS-1',
              startDate: '2026-01-01',
              status: 'active',
            },
          ],
        };
      if (input.IndexName === 'SessionAttendanceIndex') return { Items: existing };
      if (input.TransactItems) return {};
      throw new Error('Unexpected DynamoDB command');
    },
  };
  return { writer: makeM10FinalAttendanceWriter(db, () => '2026-11-19T12:00:00.000Z'), sent };
};

test('final attendance creates one canonical record and an audit atomically', async () => {
  const { writer, sent } = fixture();
  const result = await writer('sruti', 'actor-1', payload, new Set(['CLASS-1']));
  assert.equal(result.record.status, 'present');
  const transaction = sent.find((input) => input.TransactItems)?.TransactItems;
  assert.equal(transaction.length, 5);
  assert.equal(transaction[3].Put.TableName, 'sadhana-dev-m9-attendance');
  assert.equal(transaction[4].Put.TableName, 'sadhana-dev-m9-audit');
  assert.equal(transaction[3].Put.Item.sessionId, 'SESSION-1');
});

test('final attendance rejects a duplicate student-session mark', async () => {
  const { writer, sent } = fixture([{ institutionId: 'sruti', studentId: 'PERSON-1' }]);
  await assert.rejects(writer('sruti', 'actor-1', payload), /Attendance already exists/);
  assert.equal(
    sent.some((input) => input.TransactItems),
    false,
  );
});

test('final attendance rejects invalid fields before any database access', async () => {
  const { writer, sent } = fixture();
  await assert.rejects(
    writer('sruti', 'actor-1', { ...payload, status: 'unknown' }),
    /Choose student/,
  );
  assert.equal(sent.length, 0);
});
