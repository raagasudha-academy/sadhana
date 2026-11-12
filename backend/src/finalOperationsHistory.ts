/** Read-only /operations/{rsvp,practice} canonical compatibility. Never writes or queries legacy tables. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import type { InstitutionId } from './model.ts';

type Row = Record<string, any>;
type Client = { send: (cmd: any) => Promise<any> };
type Kind = 'rsvp' | 'practice';
const original = (row: Row): Row => {
  if (
    row.legacyPayload &&
    typeof row.legacyPayload === 'object' &&
    !Array.isArray(row.legacyPayload)
  ) {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entityType, ...rest } = row.legacyPayload;
    return rest;
  }
  return row;
};
export function makeM10FinalOperationsHistory(client: Client) {
  return async (
    kind: Kind,
    inst: InstitutionId,
    classIds?: ReadonlySet<string>,
    teacherId?: string,
  ): Promise<{ records: Row[] }> => {
    if (kind !== 'practice' && kind !== 'rsvp') throw Error('M10_INVALID_HISTORY_KIND');
    if (inst !== 'raaga' && inst !== 'sruti') throw Error('M10_INVALID_INSTITUTION');
    if (classIds && !teacherId) throw Error('M10_HISTORY_TEACHER_REQUIRED');
    if (classIds && !classIds.size) return { records: [] };
    async function scan(table: 'practice' | 'rsvps' | 'sessions') {
      let cursor: Record<string, unknown> | undefined;
      const rows: Row[] = [];
      do {
        const page = await client.send(
          new ScanCommand({
            TableName: entityTable(table),
            ConsistentRead: true,
            Limit: 200,
            ExclusiveStartKey: cursor,
          }),
        );
        rows.push(...(page.Items ?? []));
        cursor = page.LastEvaluatedKey;
        if (rows.length > 6000) throw Error('M10_OPERATIONS_HISTORY_REQUIRES_PAGINATION');
      } while (cursor);
      return rows;
    }
    const rows = (await scan(kind === 'practice' ? 'practice' : 'rsvps')).filter(
      (row) =>
        row.institutionId === inst &&
        (kind !== 'practice' || row.recordType !== 'operational-feedback'),
    );
    let sessions = new Map<string, Row>();
    if (kind === 'rsvp' && classIds) {
      sessions = new Map(
        (await scan('sessions'))
          .filter((row) => row.institutionId === inst)
          .map((row) => [row.sessionId, row]),
      );
    }
    const records = rows
      .filter((row) => {
        if (!classIds) return true;
        if (kind === 'practice') {
          const source = original(row);
          return typeof source.classId === 'string' && classIds.has(source.classId);
        }
        const source = original(row);
        const session = sessions.get(row.sessionId ?? source.sessionId);
        if (!session) return false;
        const details = original(session);
        const classId = session.classId ?? details.classId;
        return (
          (typeof classId === 'string' && classIds.has(classId)) ||
          (details.eventKind === 'class' && details.teacherId === teacherId)
        );
      })
      .map((row) => {
        const source = original(row);
        if (source !== row) return source;
        if (kind === 'practice')
          return {
            id: row.practiceId,
            institution: inst,
            studentId: row.studentId,
            classId: row.classId,
            date: row.practiceDate ?? row.practiceDateKey,
            didPractice: row.didPractice ?? true,
            minutes: row.minutes ?? 0,
            comments: row.comments ?? '',
            version: row.version ?? 1,
          };
        return {
          id: row.rsvpId,
          institution: inst,
          studentId: row.studentId,
          sessionId: row.sessionId,
          intention: row.intention ?? row.response ?? 'unknown',
          note: row.note ?? '',
          version: row.version ?? 1,
        };
      });
    return { records };
  };
}
let cached: ReturnType<typeof makeM10FinalOperationsHistory> | undefined;
export function finalOperationsHistory() {
  if (!cached)
    cached = makeM10FinalOperationsHistory(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      ),
    );
  return cached;
}
