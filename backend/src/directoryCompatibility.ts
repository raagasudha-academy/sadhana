import { entityTable } from './entityTables.mjs';
/** Read-only M9 teacher/venue compatibility, independent of the legacy router. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { signedProfilePhoto } from './profilePhotos.ts';
import { suggestedTeacherIds } from './teacherNameMatch.ts';
import { legacyRecord, canonicalRecords } from './compatibility.ts';
import type { CompatibleItem, CompatClient } from './compatibility.ts';
import type { Claims, InstitutionId } from './model.ts';
import { demandViewInstitution, permittedInstitutions } from './model.ts';
import { filterVenuesForInstitution } from './venueVisibility.ts';

export type DirectoryEntity = 'people' | 'venues' | 'classes';
const MAX_ROWS: Record<DirectoryEntity, number> = { people: 1000, venues: 500, classes: 1500 };
const teacherSub = (row: Record<string, any>) =>
  typeof row.cognitoSub === 'string' ? row.cognitoSub : '';

/** Old /teachers projection, without leaking a teacher's Cognito subject to viewers. */
export async function presentM9Teachers(
  inst: InstitutionId,
  claims: Claims,
  items: CompatibleItem[],
  photo: (sub: string) => Promise<string> = signedProfilePhoto,
) {
  demandViewInstitution(claims, inst);
  const admin = permittedInstitutions(claims).includes(inst);
  const candidates = items
    .filter(
      (x) => Array.isArray((x as any).personTypes) && (x as any).personTypes.includes('teacher'),
    )
    .map((x) => legacyRecord(x))
    .filter((x) => Array.isArray(x.institutions) && x.institutions.includes(inst));
  return {
    records: await Promise.all(
      candidates.map(async (row) => ({
        ...row,
        cognitoSub: admin ? teacherSub(row) : '',
        photoUrl: teacherSub(row) ? await photo(teacherSub(row)) : '',
      })),
    ),
    more: false as const,
  };
}

export function presentM9TeacherIdentity(
  inst: InstitutionId,
  claims: Claims,
  items: CompatibleItem[],
) {
  demandViewInstitution(claims, inst);
  const match = items
    .filter(
      (x) => Array.isArray((x as any).personTypes) && (x as any).personTypes.includes('teacher'),
    )
    .map((x) => legacyRecord(x))
    .find(
      (row) =>
        row.active === true &&
        row.cognitoSub === claims.sub &&
        Array.isArray(row.institutions) &&
        row.institutions.includes(inst),
    );
  return { linked: !!match, teacherId: match?.id ?? null };
}

/** Old /venues response, filtered by active academy class usage and shared-venue links. */
export function presentM9Venues(
  inst: InstitutionId,
  claims: Claims,
  items: CompatibleItem[],
  classes: CompatibleItem[] = [],
) {
  demandViewInstitution(claims, inst);
  const relevant = filterVenuesForInstitution(
    inst,
    items as Record<string, any>[],
    classes as Record<string, any>[],
  );
  return {
    records: relevant.map((x) => {
      const { GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...publicVenue } = legacyRecord(x);
      return publicVenue;
    }),
    more: false as const,
  };
}

/** Old /classes contract. Shadow only until class writes and enrolment integrity migrate. */
export function presentM9Classes(inst: InstitutionId, claims: Claims, items: CompatibleItem[]) {
  demandViewInstitution(claims, inst);
  const records = items
    .filter((item) => item.institutionId === inst)
    .map((item) => legacyRecord(item))
    .filter((row) => row.institution === inst && typeof row.id === 'string' && row.id.length > 0);
  return { records, more: false as const };
}

/** Compare business data rather than signed S3 URLs (which can change on each request). */
export function sameDirectoryRows(
  a: ReadonlyArray<Record<string, any>>,
  b: ReadonlyArray<Record<string, any>>,
) {
  const clean = (rows: ReadonlyArray<Record<string, any>>) =>
    rows.map(({ photoUrl, ...rest }) => rest);
  return canonicalRecords(clean(a)) === canonicalRecords(clean(b));
}

/** Read-only assignment listing from the canonical people/classes/sessions tables. */
export async function presentFinalTeacherLinks(
  inst: InstitutionId,
  claims: Claims,
  people: CompatibleItem[],
  classes: CompatibleItem[],
  sessions: CompatibleItem[],
  photo: (sub: string) => Promise<string> = signedProfilePhoto,
) {
  demandViewInstitution(claims, inst);
  if (!permittedInstitutions(claims).includes(inst))
    throw Error('Administrator access required for teacher links.');
  const directory = await presentM9Teachers(inst, claims, people, photo);
  const all = directory.records;
  const teachers = all.filter(
    (row: any) => row.active === true && row.institutions?.includes(inst),
  );
  const matchTeachers: Array<{
    id: string;
    displayName: string;
    aliases?: string[];
    active: boolean;
  }> = teachers
    .filter((row: any) => typeof row.id === 'string' && typeof row.displayName === 'string')
    .map((row: any) => ({
      id: row.id,
      displayName: row.displayName,
      aliases: Array.isArray(row.aliases)
        ? row.aliases.filter((x: unknown): x is string => typeof x === 'string')
        : [],
      active: true,
    }));
  const masters = classes
    .filter((item) => item.institutionId === inst)
    .map(legacyRecord)
    .filter((row) => row.recordType === 'class' || row.recordType === undefined);
  const index = new Map(masters.map((row) => [row.id, row]));
  const rows = masters.map((row) => ({
    classId: row.id,
    className: row.name,
    version: row.version,
    scope: 'master',
    effectiveFrom: '',
    teacher: row.teacher || '',
    teacherId: row.teacherId || '',
    suggestedIds: suggestedTeacherIds(row.teacher || '', matchTeachers),
  }));
  for (const item of sessions) {
    if (item.institutionId !== inst || item.recordType !== 'series-change') continue;
    const rule = item.legacyPayload;
    if (
      !rule ||
      typeof rule.classId !== 'string' ||
      !index.has(rule.classId) ||
      typeof rule.effectiveFrom !== 'string' ||
      !rule.changes?.teacher
    )
      continue;
    const master = index.get(rule.classId)!;
    rows.push({
      classId: rule.classId,
      className: master.name,
      version: master.version,
      scope: 'series',
      effectiveFrom: rule.effectiveFrom,
      teacher: rule.changes.teacher,
      teacherId: rule.changes.teacherId || '',
      suggestedIds: suggestedTeacherIds(rule.changes.teacher, matchTeachers),
    });
  }
  return {
    institution: inst,
    teachers: teachers.map(({ id, displayName, subjects, photoUrl }: any) => ({
      id,
      displayName,
      subjects,
      photoUrl,
    })),
    rows,
    more: false,
  };
}

export function makeM95DirectoryReader(
  client: CompatClient,
  photo: (sub: string) => Promise<string> = signedProfilePhoto,
) {
  const scan = async (entity: DirectoryEntity): Promise<CompatibleItem[]> => {
    const records: CompatibleItem[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const res = await client.send(
        new ScanCommand({
          TableName: entityTable(entity),
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
          Limit: 200,
        }),
      );
      records.push(...(res.Items ?? []));
      cursor = res.LastEvaluatedKey;
      if (records.length > MAX_ROWS[entity]) throw Error(`M95_DIRECTORY_LIMIT_EXCEEDED_${entity}`);
    } while (cursor);
    return records;
  };
  const scanSessions = async (): Promise<CompatibleItem[]> => {
    const rows: CompatibleItem[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await client.send(
        new ScanCommand({
          TableName: entityTable('sessions'),
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
          Limit: 200,
        }),
      );
      rows.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > 6000) throw Error('FINAL_TEACHER_LINK_SESSION_LIMIT');
    } while (cursor);
    return rows;
  };
  const peopleForSubject = async (sub: string): Promise<CompatibleItem[]> => {
    const rows: CompatibleItem[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: entityTable('people'),
          IndexName: 'CognitoIdentityIndex',
          KeyConditionExpression: '#cognitoSub = :sub',
          ExpressionAttributeNames: { '#cognitoSub': 'cognitoSub' },
          ExpressionAttributeValues: { ':sub': sub },
          ExclusiveStartKey: cursor,
          Limit: 100,
        }),
      );
      rows.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > MAX_ROWS.people) throw Error('M95_DIRECTORY_LIMIT_EXCEEDED_people');
    } while (cursor);
    return rows;
  };
  return {
    async teachers(inst: InstitutionId, claims: Claims) {
      demandViewInstitution(claims, inst);
      return presentM9Teachers(inst, claims, await scan('people'), photo);
    },
    async teacherMe(inst: InstitutionId, claims: Claims) {
      demandViewInstitution(claims, inst);
      return presentM9TeacherIdentity(inst, claims, await peopleForSubject(claims.sub));
    },
    async teacherLinks(inst: InstitutionId, claims: Claims) {
      demandViewInstitution(claims, inst);
      if (!permittedInstitutions(claims).includes(inst))
        throw Error('Administrator access required for teacher links.');
      const [people, classes, sessions] = await Promise.all([
        scan('people'),
        scan('classes'),
        scanSessions(),
      ]);
      return presentFinalTeacherLinks(inst, claims, people, classes, sessions, photo);
    },
    async venues(inst: InstitutionId, claims: Claims) {
      demandViewInstitution(claims, inst);
      const [venues, classes] = await Promise.all([scan('venues'), scan('classes')]);
      return presentM9Venues(inst, claims, venues, classes);
    },
    async classes(inst: InstitutionId, claims: Claims) {
      demandViewInstitution(claims, inst);
      return presentM9Classes(inst, claims, await scan('classes'));
    },
  };
}
export type M95DirectoryReader = ReturnType<typeof makeM95DirectoryReader>;
export function defaultM95DirectoryReader(): M95DirectoryReader {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return makeM95DirectoryReader(client);
}
