/** Canonical only: teacher-scoped student selector for the old operations URL. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { projectM10Directory } from './coreDirectoryProjection.mjs';
import type { InstitutionId } from './model.ts';

type Item = Record<string, any>;
type Client = { send: (command: any) => Promise<any> };
async function scan(client: Client, entity: 'people' | 'enrolments', max: number): Promise<Item[]> {
  const rows: Item[] = [];
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
    rows.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
    if (rows.length > max) throw Error('M10_TEACHER_STUDENT_READ_LIMIT');
  } while (cursor);
  return rows;
}
export function makeM10FinalTeacherStudents(client: Client) {
  return async (inst: InstitutionId, classIds: ReadonlySet<string>) => {
    if (inst !== 'raaga' && inst !== 'sruti') throw Error('M10_INVALID_INSTITUTION');
    if (!classIds.size) return [];
    const enrolments = projectM10Directory(
      'enrolments',
      await scan(client, 'enrolments', 3000),
      inst,
    ).records;
    const selected = new Set(
      enrolments
        .filter((row: any) => row.archived !== true && classIds.has(row.classId))
        .map((row: any) => row.studentId),
    );
    if (!selected.size) return [];
    const students = projectM10Directory(
      'students',
      await scan(client, 'people', 1500),
      inst,
    ).records;
    return students
      .filter((row: any) => selected.has(row.id) && row.archived !== true)
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        rollNumber: row.rollNumber || '',
        institution: inst,
      }));
  };
}
let cached: ReturnType<typeof makeM10FinalTeacherStudents> | undefined;
export function finalTeacherStudents() {
  if (!cached)
    cached = makeM10FinalTeacherStudents(
      DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      ),
    );
  return cached;
}
