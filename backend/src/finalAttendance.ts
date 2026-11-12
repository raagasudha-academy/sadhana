/** Canonical attendance GET compatibility; no legacy PK/SK reads or writes. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import type { InstitutionId } from './model.ts';

type Row = Record<string, any>;
type Client = { send: (command: any) => Promise<any> };
async function scan(
  client: Client,
  entity: 'attendance' | 'sessions',
  max: number,
): Promise<Row[]> {
  const result: Row[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: entityTable(entity),
        ConsistentRead: true,
        Limit: 200,
        ExclusiveStartKey: cursor,
      }),
    );
    result.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
    if (result.length > max) throw Error('M10_FINAL_ATTENDANCE_READ_LIMIT');
  } while (cursor);
  return result;
}
const clean = (row: Row) => {
  if (
    row.legacyPayload &&
    typeof row.legacyPayload === 'object' &&
    !Array.isArray(row.legacyPayload)
  ) {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...rest } = row.legacyPayload;
    return rest;
  }
  return {
    id: row.attendanceId,
    studentId: row.studentId,
    sessionId: row.sessionId,
    status: row.attendanceStatus ?? row.status,
    note: row.note ?? '',
    version: row.version ?? 1,
    institution: row.institutionId,
  };
};
export function makeM10FinalAttendance(client: Client) {
  return async (
    inst: InstitutionId,
    teacherClassIds?: ReadonlySet<string>,
    teacherId?: string,
  ): Promise<{ records: Row[] }> => {
    if (inst !== 'raaga' && inst !== 'sruti') throw Error('M10_INVALID_INSTITUTION');
    if (teacherClassIds && !teacherId) throw Error('M10_ATTENDANCE_TEACHER_REQUIRED');
    if (teacherClassIds && !teacherClassIds.size) return { records: [] };
    const attendance = await scan(client, 'attendance', 6000);
    // Teacher-scoped reads must derive the session's academy/class, never trust a
    // caller-supplied classId or an attendance row's optional classId alone.
    const sessions = teacherClassIds ? await scan(client, 'sessions', 6000) : [];
    const sessionsById = new Map(
      sessions.filter((s) => s.institutionId === inst).map((s) => [s.sessionId, s]),
    );
    const records = attendance
      .filter((row) => {
        if (row.institutionId !== inst) return false;
        if (!teacherClassIds) return true;
        const s = sessionsById.get(row.sessionId);
        if (!s) return false;
        const source = s.legacyPayload ?? s;
        const classId = s.classId ?? source.classId;
        if (source.eventKind === 'class' && source.teacherId === teacherId) return true;
        return typeof classId === 'string' && teacherClassIds.has(classId);
      })
      .map(clean);
    return { records };
  };
}
let cached: ReturnType<typeof makeM10FinalAttendance> | undefined;
export function finalAttendance() {
  if (!cached)
    cached = makeM10FinalAttendance(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      ),
    );
  return cached;
}
