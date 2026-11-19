/** Canonical attendance creation for the final entity tables. */
import { createHash, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import type { InstitutionId } from './model.ts';

type Db = { send: (command: any) => Promise<any> };
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const validId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{4,150}$/.test(value);

export function makeM10FinalAttendanceWriter(db: Db, now = () => new Date().toISOString()) {
  return async function create(
    institution: InstitutionId,
    actor: string,
    data: Record<string, any>,
    assignedClassIds?: ReadonlySet<string>,
  ) {
    if (institution !== 'raaga' && institution !== 'sruti') throw fail(400, 'Choose an academy.');
    if (!actor) throw fail(401, 'Authenticated account required.');
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw fail(400, 'Invalid attendance.');
    if (
      Object.keys(data).some((key) => !['studentId', 'sessionId', 'status', 'note'].includes(key))
    )
      throw fail(400, 'Unsupported attendance field.');
    const { studentId, sessionId, status } = data;
    const note = data.note ?? '';
    if (
      !validId(studentId) ||
      !validId(sessionId) ||
      !['present', 'absent', 'late', 'excused'].includes(status)
    )
      throw fail(400, 'Choose student, session and attendance status.');
    if (typeof note !== 'string' || note.length > 1000)
      throw fail(400, 'Attendance note is too long.');

    const [sessionResult, studentResult] = await Promise.all([
      db.send(
        new GetCommand({
          TableName: entityTable('sessions'),
          Key: { sessionId },
          ConsistentRead: true,
        }),
      ),
      db.send(
        new GetCommand({
          TableName: entityTable('people'),
          Key: { personId: studentId },
          ConsistentRead: true,
        }),
      ),
    ]);
    const session = sessionResult.Item;
    const student = studentResult.Item;
    if (
      !session ||
      session.institutionId !== institution ||
      session.recordType !== 'class-session' ||
      !session.classId ||
      !session.date
    )
      throw fail(404, 'Dated class session not found.');
    if (assignedClassIds && !assignedClassIds.has(session.classId))
      throw fail(403, 'Assigned class required.');
    if (
      !student ||
      student.status !== 'active' ||
      !student.personTypes?.includes('student') ||
      !student.institutionIds?.includes(institution)
    )
      throw fail(404, 'Active student not found in this academy.');

    const [classResult, enrolmentResult, existingResult] = await Promise.all([
      db.send(
        new GetCommand({
          TableName: entityTable('classes'),
          Key: { classId: session.classId },
          ConsistentRead: true,
        }),
      ),
      db.send(
        new QueryCommand({
          TableName: entityTable('enrolments'),
          IndexName: 'StudentEnrolmentsIndex',
          KeyConditionExpression: 'studentId = :studentId',
          ExpressionAttributeValues: { ':studentId': studentId },
          ConsistentRead: false,
        }),
      ),
      db.send(
        new QueryCommand({
          TableName: entityTable('attendance'),
          IndexName: 'SessionAttendanceIndex',
          KeyConditionExpression: 'sessionId = :sessionId',
          ExpressionAttributeValues: { ':sessionId': sessionId },
          ConsistentRead: false,
        }),
      ),
    ]);
    const cls = classResult.Item;
    if (
      !cls ||
      cls.institutionId !== institution ||
      cls.recordType !== 'class' ||
      cls.status === 'archived' ||
      cls.lifecycleStatus === 'archived'
    )
      throw fail(409, 'Class is not active in this academy.');
    const eligible = (enrolmentResult.Items ?? []).find(
      (row: any) =>
        row.institutionId === institution &&
        row.classId === session.classId &&
        row.status !== 'archived' &&
        row.startDate <= session.date &&
        (!row.endDate || row.endDate >= session.date),
    );
    if (!eligible) throw fail(403, 'Student is not enrolled in this class on the session date.');
    if (
      (existingResult.Items ?? []).some(
        (row: any) => row.institutionId === institution && row.studentId === studentId,
      )
    )
      throw fail(409, 'Attendance already exists for this student and session.');

    const timestamp = now();
    const id = `ATTENDANCE-${createHash('sha256').update(`${institution}:${studentId}:${sessionId}`).digest('hex').slice(0, 40)}`;
    const record = {
      attendanceId: id,
      institutionId: institution,
      studentId,
      sessionId,
      attendanceStatus: status,
      note: note.trim(),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: actor,
    };
    const audit = {
      auditId: `AUDIT-${randomUUID()}`,
      institutionId: institution,
      action: 'attendanceCreate',
      actorCognitoSub: actor,
      timestamp,
      resourceType: 'attendance',
      resourceId: id,
    };
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: entityTable('sessions'),
                Key: { sessionId },
                ConditionExpression: 'institutionId=:inst AND #type=:type AND #version=:version',
                ExpressionAttributeNames: { '#type': 'recordType', '#version': 'version' },
                ExpressionAttributeValues: {
                  ':inst': institution,
                  ':type': 'class-session',
                  ':version': session.version,
                },
              },
            },
            {
              ConditionCheck: {
                TableName: entityTable('people'),
                Key: { personId: studentId },
                ConditionExpression:
                  '#status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:student)',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':active': 'active',
                  ':inst': institution,
                  ':student': 'student',
                },
              },
            },
            {
              ConditionCheck: {
                TableName: entityTable('enrolments'),
                Key: { enrolmentId: eligible.enrolmentId },
                ConditionExpression:
                  'institutionId=:inst AND studentId=:student AND classId=:class AND (attribute_not_exists(#status) OR #status<>:archived) AND startDate<=:date AND (attribute_not_exists(endDate) OR endDate>=:date)',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':inst': institution,
                  ':student': studentId,
                  ':class': session.classId,
                  ':archived': 'archived',
                  ':date': session.date,
                },
              },
            },
            {
              Put: {
                TableName: entityTable('attendance'),
                Item: record,
                ConditionExpression: 'attribute_not_exists(attendanceId)',
              },
            },
            {
              Put: {
                TableName: entityTable('audit'),
                Item: audit,
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
    } catch (error: any) {
      if (error?.name === 'TransactionCanceledException')
        throw fail(409, 'Attendance changed or already exists. Refresh and retry.');
      throw error;
    }
    return {
      record: { id, institution, studentId, sessionId, status, note: note.trim(), version: 1 },
    };
  };
}

let singleton: ReturnType<typeof makeM10FinalAttendanceWriter> | undefined;
export function finalAttendanceWriter() {
  if (!singleton)
    singleton = makeM10FinalAttendanceWriter(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      ),
    );
  return singleton;
}
