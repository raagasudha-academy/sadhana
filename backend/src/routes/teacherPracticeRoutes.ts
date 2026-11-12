import { entityTable } from '../entityTables.mjs';
/** M9-backed teacher practice comments. Opt-in and no legacy PK/SK fallback. */
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { httpError } from '../model.ts';
import type { Claims, InstitutionId } from '../model.ts';
import { json, readJSON } from './http.ts';
import type { DomainRoute } from './http.ts';

type Database = { send: (command: any) => Promise<any> };
const table = (entity: string) => entityTable(entity);
let defaultDb: Database | undefined;
const db = () =>
  (defaultDb ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  ));
const allowedId = (id: string) => typeof id === 'string' && /^[-A-Za-z0-9_]{4,180}$/.test(id);
export function validateM9TeacherComment(body: unknown): string {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => k !== 'comment')
  )
    throw httpError(400, 'Only comment is allowed.');
  const comment = (body as { comment?: unknown }).comment;
  if (typeof comment !== 'string' || !comment.trim() || comment.trim().length > 1000)
    throw httpError(400, 'Comment must be 1–1000 characters.');
  return comment.trim();
}
type PracticeMediaLinks = {
  signGet: (bucket: string, key: string, mime: string) => Promise<string>;
};
const mediaS3 = new S3Client({});
const signedPracticeMedia: PracticeMediaLinks = {
  signGet: (bucket, key, mime) =>
    getSignedUrl(
      mediaS3,
      new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: mime }),
      { expiresIn: 180 },
    ),
};
export function makeM10TeacherPracticeRoutes(
  client: Database = db(),
  mediaLinks: PracticeMediaLinks = signedPracticeMedia,
): DomainRoute {
  const get = async (entity: string, key: string, id: string) =>
    (
      await client.send(
        new GetCommand({ TableName: table(entity), Key: { [key]: id }, ConsistentRead: true }),
      )
    ).Item;
  async function assignment(inst: InstitutionId, claims: Claims, practiceId: string) {
    if (!allowedId(practiceId)) throw httpError(400, 'Invalid practice identifier.');
    if (!claims.sub) throw httpError(401, 'Authentication required.');
    const practice = await get('practice', 'practiceId', practiceId);
    if (!practice || practice.institutionId !== inst)
      throw httpError(404, 'Practice entry not found.');
    const cls = await get('classes', 'classId', practice.classId);
    if (!cls || cls.institutionId !== inst || cls.status === 'archived')
      throw httpError(403, 'Verified teaching assignment required.');
    const identity = await client.send(
      new QueryCommand({
        TableName: table('people'),
        IndexName: 'CognitoIdentityIndex',
        KeyConditionExpression: 'cognitoSub=:sub',
        ExpressionAttributeValues: { ':sub': claims.sub },
        Limit: 30,
      }),
    );
    const people = (identity.Items ?? []).filter(
      (p: any) =>
        p.cognitoSub === claims.sub &&
        p.status === 'active' &&
        p.institutionIds?.includes(inst) &&
        Array.isArray(p.personTypes) &&
        p.personTypes.includes('teacher') &&
        cls.teacherPersonIds?.includes(p.personId),
    );
    if (people.length !== 1) throw httpError(403, 'Verified teaching assignment required.');
    const person = people[0];
    const active = await get('people', 'personId', person.personId);
    if (
      !active ||
      active.status !== 'active' ||
      active.cognitoSub !== claims.sub ||
      !active.institutionIds?.includes(inst) ||
      !active.personTypes?.includes('teacher')
    )
      throw httpError(403, 'Verified teaching assignment required.');
    return { practice, cls, person: active };
  }
  return async ({ event, parts, method, inst, claims }) => {
    if (
      parts[0] !== 'teacher-practice' ||
      parts.length !== 3 ||
      !['comments', 'media'].includes(parts[2])
    )
      return undefined;
    const media = parts[2] === 'media';
    if (media && method !== 'GET')
      return json(405, { error: 'Unsupported practice media action.' });
    if (
      process.env.SADHANA_ENTITY_TABLE_SET === 'final'
        ? method === 'GET'
          ? process.env.SADHANA_FINAL_TEACHER_PRACTICE_READS !== 'enabled'
          : process.env.SADHANA_FINAL_TEACHER_PRACTICE_WRITES !== 'enabled'
        : process.env.M10_TEACHER_PRACTICE_M9 !== 'enabled'
    )
      return undefined;
    if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Select a valid institution.');
    if (!media && method !== 'GET' && method !== 'POST')
      return json(405, { error: 'Unsupported comment action.' });
    const { practice, cls, person } = await assignment(inst, claims, parts[1]);
    if (media) {
      const bucket = process.env.SADHANA_LEARNER_MEDIA_BUCKET;
      if (!bucket) throw httpError(503, 'Private learner media storage not configured.');
      const rows = await client.send(
        new QueryCommand({
          TableName: table('submissions'),
          IndexName: 'StudentSubmissionsIndex',
          KeyConditionExpression: 'studentId=:student',
          ExpressionAttributeValues: { ':student': practice.studentId },
          Limit: 200,
        }),
      );
      const records = [];
      for (const row of rows.Items ?? []) {
        if (
          row.recordType !== 'learner-media' ||
          row.mediaStatus !== 'ready' ||
          row.purpose !== 'practice' ||
          row.practiceId !== practice.practiceId ||
          row.institutionId !== inst ||
          row.studentId !== practice.studentId ||
          !row.objectKey?.startsWith(`homework-private/learner/${inst}/${practice.studentId}/`) ||
          ![
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
            'audio/mpeg',
            'audio/mp4',
            'audio/aac',
            'audio/wav',
            'audio/x-wav',
            'video/mp4',
            'video/quicktime',
            'video/3gpp',
          ].includes(row.mime)
        )
          continue;
        records.push({
          id: row.submissionId,
          mime: row.mime,
          createdAt: row.createdAt,
          url: await mediaLinks.signGet(bucket, row.objectKey, row.mime),
        });
        if (records.length >= 10) break;
      }
      return json(200, { records });
    }
    if (method === 'GET')
      return json(200, {
        records: (practice.teacherComments ?? []).map((c: any) => ({
          id: c.id,
          practiceId: practice.practiceId,
          comment: c.comment,
          createdAt: c.createdAt,
        })),
      });
    const comment = validateM9TeacherComment(
      readJSON(
        event.body
          ? event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf8')
            : event.body
          : '',
      ),
    );
    const existing = practice.teacherComments ?? [];
    if (!Array.isArray(existing) || existing.length >= 100)
      throw httpError(409, 'Comment limit reached.');
    if (!Number.isSafeInteger(practice.version) || practice.version < 1)
      throw httpError(409, 'Practice version missing.');
    const now = new Date().toISOString(),
      id = `COMMENT-${randomUUID()}`;
    const record = { id, comment, createdAt: now, actorPersonId: person.personId };
    const audit = {
      auditId: `AUDIT-${randomUUID()}`,
      institutionId: inst,
      action: 'teacherPracticeComment',
      actorCognitoSub: claims.sub,
      actorPersonId: person.personId,
      timestamp: now,
      resourceType: 'practice',
      resourceId: practice.practiceId,
    };
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: table('people'),
                Key: { personId: person.personId },
                ConditionExpression:
                  '#status=:active AND cognitoSub=:sub AND contains(institutionIds,:inst) AND contains(personTypes,:teacher)',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':active': 'active',
                  ':sub': claims.sub,
                  ':inst': inst,
                  ':teacher': 'teacher',
                },
              },
            },
            {
              ConditionCheck: {
                TableName: table('classes'),
                Key: { classId: cls.classId },
                ConditionExpression:
                  'institutionId=:inst AND contains(teacherPersonIds,:teacherId) AND #status<>:archived',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':inst': inst,
                  ':teacherId': person.personId,
                  ':archived': 'archived',
                },
              },
            },
            {
              Update: {
                TableName: table('practice'),
                Key: { practiceId: practice.practiceId },
                UpdateExpression:
                  'SET teacherComments=list_append(if_not_exists(teacherComments,:empty),:new),version=:next,updatedAt=:now,teacherReviewed=:reviewed',
                ConditionExpression: 'institutionId=:inst AND classId=:class AND #version=:prior',
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: {
                  ':empty': [],
                  ':new': [record],
                  ':next': practice.version + 1,
                  ':now': now,
                  ':reviewed': true,
                  ':inst': inst,
                  ':class': cls.classId,
                  ':prior': practice.version,
                },
              },
            },
            {
              Put: {
                TableName: table('audit'),
                Item: audit,
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
    } catch (error: any) {
      if (
        error?.name === 'TransactionCanceledException' ||
        error?.name === 'ConditionalCheckFailedException'
      )
        throw httpError(409, 'Assignment or practice changed; refresh and retry.');
      throw error;
    }
    return json(201, {
      record: {
        id,
        practiceId: practice.practiceId,
        studentId: practice.studentId,
        classId: practice.classId,
        comment,
        createdAt: now,
      },
    });
  };
}
export const m10TeacherPracticeRoutes = makeM10TeacherPracticeRoutes();
