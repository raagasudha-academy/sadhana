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
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { httpError } from '../model.ts';
import { homeworkMediaAllowed, homeworkMediaRules } from '../homeworkMediaPolicy.ts';
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
    Object.keys(body).some((k) => !['comment', 'audioId'].includes(k))
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
  const audioMimeAllowed = (mime: unknown, size: unknown) =>
    typeof mime === 'string' && mime.startsWith('audio/') && homeworkMediaAllowed(mime, size);
  const audioIdAllowed = (id: unknown) =>
    typeof id === 'string' && /^FEEDBACK-[0-9a-f-]{36}$/i.test(id);
  const audioExt = (mime: string) =>
    homeworkMediaRules[mime as keyof typeof homeworkMediaRules]?.ext;
  const mediaBucket = () => {
    const bucket = process.env.SADHANA_LEARNER_MEDIA_BUCKET;
    if (!bucket) throw httpError(503, 'Private feedback media storage not configured.');
    return bucket;
  };
  return async ({ event, parts, method, inst, claims }) => {
    if (parts[0] !== 'teacher-practice') return undefined;
    const feedbackAudio = parts.length === 4 && parts[2] === 'feedback-audio';
    if (!feedbackAudio && (parts.length !== 3 || !['comments', 'media'].includes(parts[2])))
      return undefined;
    const media = parts[2] === 'media';
    const feedbackUploadAction = feedbackAudio ? parts[3] : '';
    if (feedbackAudio && (!['start', 'finish'].includes(feedbackUploadAction) || method !== 'POST'))
      return json(405, { error: 'Unsupported practice feedback audio action.' });
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
    if (!media && !feedbackAudio && method !== 'GET' && method !== 'POST')
      return json(405, { error: 'Unsupported comment action.' });
    const { practice, cls, person } = await assignment(inst, claims, parts[1]);
    if (feedbackAudio) {
      if (practice.teacherReviewed === true || (practice.teacherComments?.length ?? 0) > 0)
        throw httpError(409, 'This practice has already been reviewed and is read-only.');
      const requestBody = readJSON(
        event.body
          ? event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf8')
            : event.body
          : '',
      );
      const bucket = mediaBucket();
      if (feedbackUploadAction === 'start') {
        if (
          !requestBody ||
          typeof requestBody !== 'object' ||
          Object.keys(requestBody).some((k) => !['mime', 'size'].includes(k)) ||
          !audioMimeAllowed(requestBody.mime, requestBody.size)
        )
          throw httpError(400, 'Unsupported audio type or size.');
        const audioId = `FEEDBACK-${randomUUID()}`;
        const key = `homework-private/teacher-feedback/${inst}/practice/${practice.practiceId}/${audioId}.${audioExt(requestBody.mime)}`;
        const metadata = { institution: inst, practice: practice.practiceId, receipt: audioId };
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: table('submissions'),
                  Item: {
                    submissionId: audioId,
                    recordType: 'teacher-feedback-audio',
                    purpose: 'practice',
                    institutionId: inst,
                    practiceId: practice.practiceId,
                    classId: cls.classId,
                    studentId: practice.studentId,
                    uploadedBy: claims.sub,
                    objectKey: key,
                    mime: requestBody.mime,
                    size: requestBody.size,
                    mediaStatus: 'pending',
                    createdAt: new Date().toISOString(),
                  },
                  ConditionExpression: 'attribute_not_exists(submissionId)',
                },
              },
            ],
          }),
        );
        const uploadUrl = await getSignedUrl(
          mediaS3,
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: requestBody.mime,
            ContentLength: requestBody.size,
            Metadata: metadata,
          }),
          {
            expiresIn: 300,
            unhoistableHeaders: new Set([
              'x-amz-meta-institution',
              'x-amz-meta-practice',
              'x-amz-meta-receipt',
            ]),
          },
        );
        return json(200, {
          audioId,
          key: audioId,
          uploadUrl,
          headers: {
            'Content-Type': requestBody.mime,
            'x-amz-meta-institution': inst,
            'x-amz-meta-practice': practice.practiceId,
            'x-amz-meta-receipt': audioId,
          },
        });
      }
      if (
        !requestBody ||
        typeof requestBody !== 'object' ||
        Object.keys(requestBody).some((k) => k !== 'key') ||
        !audioIdAllowed(requestBody.key)
      )
        throw httpError(400, 'Invalid feedback audio reference.');
      const receipt = await get('submissions', 'submissionId', requestBody.key);
      if (
        !receipt ||
        receipt.recordType !== 'teacher-feedback-audio' ||
        receipt.purpose !== 'practice' ||
        receipt.mediaStatus !== 'pending' ||
        receipt.institutionId !== inst ||
        receipt.practiceId !== practice.practiceId ||
        receipt.uploadedBy !== claims.sub
      )
        throw httpError(403, 'Feedback audio access denied.');
      const head = await mediaS3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: receipt.objectKey }),
      );
      if (
        head.ContentLength !== receipt.size ||
        head.ContentType !== receipt.mime ||
        head.Metadata?.institution !== inst ||
        head.Metadata?.practice !== practice.practiceId ||
        head.Metadata?.receipt !== receipt.submissionId
      )
        throw httpError(409, 'Feedback audio verification failed.');
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: table('submissions'),
                Key: { submissionId: receipt.submissionId },
                UpdateExpression: 'SET mediaStatus=:ready, verifiedAt=:now',
                ConditionExpression:
                  'recordType=:type AND mediaStatus=:pending AND uploadedBy=:actor AND practiceId=:practice AND institutionId=:inst',
                ExpressionAttributeValues: {
                  ':ready': 'ready',
                  ':now': new Date().toISOString(),
                  ':type': 'teacher-feedback-audio',
                  ':pending': 'pending',
                  ':actor': claims.sub,
                  ':practice': practice.practiceId,
                  ':inst': inst,
                },
              },
            },
          ],
        }),
      );
      return json(200, { audioId: receipt.submissionId, ready: true });
    }
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
        records: await Promise.all(
          (practice.teacherComments ?? []).map(async (c: any) => {
            const receipt = audioIdAllowed(c.audioId)
              ? await get('submissions', 'submissionId', c.audioId)
              : null;
            const audioUrl =
              receipt?.recordType === 'teacher-feedback-audio' &&
              receipt.mediaStatus === 'ready' &&
              receipt.purpose === 'practice' &&
              receipt.institutionId === inst &&
              receipt.practiceId === practice.practiceId
                ? await signedPracticeMedia.signGet(mediaBucket(), receipt.objectKey, receipt.mime)
                : undefined;
            return {
              id: c.id,
              practiceId: practice.practiceId,
              comment: c.comment,
              createdAt: c.createdAt,
              ...(audioUrl ? { audioUrl } : {}),
            };
          }),
        ),
      });
    if (practice.teacherReviewed === true || (practice.teacherComments?.length ?? 0) > 0)
      throw httpError(409, 'This practice has already been reviewed and is read-only.');
    const commentBody = readJSON(
      event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '',
    );
    const comment = validateM9TeacherComment(commentBody);
    const audioId = commentBody?.audioId;
    let audioReceipt: any;
    if (audioId !== undefined) {
      if (!audioIdAllowed(audioId)) throw httpError(400, 'Invalid feedback audio reference.');
      audioReceipt = await get('submissions', 'submissionId', audioId);
      if (
        !audioReceipt ||
        audioReceipt.recordType !== 'teacher-feedback-audio' ||
        audioReceipt.purpose !== 'practice' ||
        audioReceipt.mediaStatus !== 'ready' ||
        audioReceipt.institutionId !== inst ||
        audioReceipt.practiceId !== practice.practiceId ||
        audioReceipt.uploadedBy !== claims.sub
      )
        throw httpError(403, 'Feedback audio access denied.');
    }
    const existing = practice.teacherComments ?? [];
    if (!Array.isArray(existing) || existing.length >= 100)
      throw httpError(409, 'Comment limit reached.');
    if (!Number.isSafeInteger(practice.version) || practice.version < 1)
      throw httpError(409, 'Practice version missing.');
    const now = new Date().toISOString(),
      id = `COMMENT-${randomUUID()}`;
    const record = {
      id,
      comment,
      ...(audioId ? { audioId } : {}),
      createdAt: now,
      actorPersonId: person.personId,
    };
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
            ...(audioReceipt
              ? [
                  {
                    ConditionCheck: {
                      TableName: table('submissions'),
                      Key: { submissionId: audioReceipt.submissionId },
                      ConditionExpression:
                        'recordType=:type AND mediaStatus=:ready AND purpose=:purpose AND institutionId=:inst AND practiceId=:practice AND uploadedBy=:actor',
                      ExpressionAttributeValues: {
                        ':type': 'teacher-feedback-audio',
                        ':ready': 'ready',
                        ':purpose': 'practice',
                        ':inst': inst,
                        ':practice': practice.practiceId,
                        ':actor': claims.sub,
                      },
                    },
                  },
                ]
              : []),
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
