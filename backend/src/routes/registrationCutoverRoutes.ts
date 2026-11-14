import { srutiRegistrationTable } from '../srutiRegistrationSource.mjs';
/** Sruti-only M9 intake directory and separately gated review decisions.
 * Student import, photo upload, provisioning and revocation remain separate.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DomainRoute } from './http.ts';
import { json, readJSON } from './http.ts';
import { demandInstitution, httpError } from '../model.ts';
import { m95ImportApprovedWebsiteRegistration } from '../websiteImport.ts';

type M9RegistrationRow = Record<string, unknown>;
export type RegistrationReader = {
  list: (
    institution: 'raaga' | 'sruti',
    limit: number,
  ) => Promise<{ items: M9RegistrationRow[]; more: boolean }>;
  get: (registrationId: string) => Promise<M9RegistrationRow | null>;
};
let db: DynamoDBDocumentClient | undefined;
const client = () =>
  (db ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
  ));
// Lazy resolution prevents a missing final-table acknowledgement from failing Lambda cold start.
const sourceTable = () => srutiRegistrationTable();
const defaultReader: RegistrationReader = {
  async list(inst, limit) {
    const page = await client().send(
      new QueryCommand({
        TableName: sourceTable(),
        IndexName: 'InstitutionRegistrationsIndex',
        KeyConditionExpression: 'institutionId = :inst',
        ExpressionAttributeValues: { ':inst': inst },
        Limit: limit,
      }),
    );
    return { items: (page.Items ?? []) as M9RegistrationRow[], more: !!page.LastEvaluatedKey };
  },
  async get(id) {
    const item = await client().send(
      new GetCommand({
        TableName: sourceTable(),
        Key: { registrationId: id },
        ConsistentRead: true,
      }),
    );
    return (item.Item as M9RegistrationRow) ?? null;
  },
};
const denied = () =>
  json(503, {
    error: 'This Sruti registration operation is not enabled. No legacy database fallback.',
  });
const safeId = (id: string) => /^[A-Za-z0-9_-]{1,120}$/.test(id);
const publicRow = (item: M9RegistrationRow) => ({
  registrationId: item.registrationId,
  externalRegistrationId: item.externalRegistrationId,
  institutionId: item.institutionId,
  source: item.source,
  status: item.status,
  reviewStatus: item.reviewStatus,
  importStatus: item.importStatus,
  submittedAt: item.submittedAt,
  updatedAt: item.updatedAt,
  familyId: item.familyId,
  studentIds: item.studentIds,
});

/** Sruti decisions are independent of the broader M9/M10 cutover flags.
 * No students, families or guardian access are touched. DynamoDB conditional
 * writes ensure only a still-pending Sruti website intake can be reviewed once.
 */
const defaultSrutiReview: DomainRoute = async ({ event, parts, claims }) => {
  const id = parts[2];
  if (!id || !safeId(id)) throw httpError(400, 'Invalid registration identifier.');
  const raw = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : '';
  const body = readJSON(raw);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !['approved', 'discarded'].includes(body.reviewStatus) ||
    !Number.isSafeInteger(body.expectedVersion) ||
    body.expectedVersion < 1 ||
    Object.keys(body).some((key) => !['reviewStatus', 'expectedVersion'].includes(key))
  )
    throw httpError(400, 'Invalid review decision or expected version.');
  const now = new Date().toISOString();
  try {
    await client().send(
      new UpdateCommand({
        TableName: sourceTable(),
        Key: { registrationId: id },
        UpdateExpression:
          'SET reviewStatus=:next,#status=:next,updatedAt=:now,reviewedBy=:reviewer,version=:nextVersion',
        ConditionExpression:
          'institutionId=:inst AND #source=:source AND reviewStatus=:pending AND importStatus=:pending AND version=:previous',
        ExpressionAttributeNames: { '#source': 'source', '#status': 'status' },
        ExpressionAttributeValues: {
          ':inst': 'sruti',
          ':source': 'sruti-website',
          ':pending': 'pending',
          ':next': body.reviewStatus,
          ':now': now,
          ':reviewer': claims.sub,
          ':previous': body.expectedVersion,
          ':nextVersion': body.expectedVersion + 1,
        },
      }),
    );
  } catch (e: any) {
    if (['ConditionalCheckFailedException', 'TransactionCanceledException'].includes(e?.name))
      throw httpError(409, 'This registration has changed. Refresh before reviewing it again.');
    throw e;
  }
  return json(200, {
    registrationId: id,
    reviewStatus: body.reviewStatus,
    version: body.expectedVersion + 1,
    guardianAccessGranted: false,
  });
};

/** Sruti frontend PATCH uses a separate, opt-in conditional M9 reviewer.
 * No website-status, student import or Cognito access changes happen here.
 */
export function makeM10RegistrationCutoverRoutes(
  reader: RegistrationReader = defaultReader,
  srutiReview: DomainRoute = defaultSrutiReview,
  srutiImport: typeof m95ImportApprovedWebsiteRegistration = m95ImportApprovedWebsiteRegistration,
): DomainRoute {
  return async ({ parts, method, query, claims, event, groups, inst }) => {
    if (parts[0] !== 'website-registrations') return undefined;
    // Sruti's private intake source is stage-isolated from Sadhana's imported
    // registration markers. Route it explicitly,
    // regardless of the global M10 cutover flag. Raagasudha remains on its
    // existing website-registration gateway until its separate migration.
    if (query.institution !== 'sruti') {
      if (query.institution !== undefined && query.institution !== 'raaga')
        throw httpError(400, 'Invalid institution.');
      // A Sruti-only administrator must never fall through into a Raaga route.
      if (query.institution === 'raaga') demandInstitution(claims, 'raaga');
      return undefined;
    }
    const institution = 'sruti';
    demandInstitution(claims, institution);
    // Reads remain safe without the M9/M10 write cutover. Review writes have a
    // separate flag, not the broad M95_ONBOARDING_MODE switch.
    if (institution === 'sruti' && method === 'PATCH' && parts.length === 2) {
      if (!safeId(parts[1])) throw httpError(400, 'Invalid registration identifier.');
      if (process.env.M91_SRUTI_REVIEW_WRITES !== 'enabled') return denied();
      // Delegate only to the version-checked, Sruti-scoped M9 reviewer.
      return srutiReview({
        parts: ['m9-onboarding', 'sruti-intake', parts[1], 'review'],
        method,
        query: { ...query, institution: 'sruti' },
        claims,
        event,
        groups,
        inst: 'sruti',
      });
    }
    // Preview is read-only. Execute is separately gated and runs the existing
    // atomic M9 import planner; it never provisions Cognito or verifies guardians.
    if (
      method === 'POST' &&
      parts.length === 3 &&
      ['import-preview', 'import-execute'].includes(parts[2])
    ) {
      if (!/^SR-[A-Za-z0-9-]{1,110}$/.test(parts[1]))
        throw httpError(400, 'Invalid Sruti registration identifier.');
      const execute = parts[2] === 'import-execute';
      if (execute && process.env.M91_SRUTI_IMPORT_WRITES !== 'enabled') return denied();
      const raw = event.body
        ? event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        : '{}';
      const body = readJSON(raw);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some((k) => k !== 'confirmReference') ||
        (execute && body.confirmReference !== parts[1]) ||
        (!execute && Object.keys(body).length !== 0)
      )
        throw httpError(400, 'Confirm the exact Sruti registration reference.');
      return json(200, await srutiImport('sruti', claims, parts[1], execute, 'fresh', true));
    }
    if (method !== 'GET') return denied();
    if (parts.length === 1) {
      // The external intake supports additional search filters; never silently
      // ignore them or claim this M9 list is API-compatible with those filters.
      if (['locationId', 'from', 'to'].some((k) => query[k] !== undefined)) return denied();
      const limit = Number(query.limit ?? '30');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw httpError(400, 'Invalid limit.');
      if (
        query.status !== undefined &&
        !['pending', 'approved', 'discarded', 'imported'].includes(query.status)
      )
        throw httpError(400, 'Invalid status.');
      const page = await reader.list(institution, limit);
      const items = page.items.filter(
        (item) => item.institutionId === institution && item.source === 'sruti-website',
      );
      // Filtering a limited GSI page cannot claim complete filter pagination.
      if (query.status !== undefined) return denied();
      return json(200, {
        records: items.map(publicRow),
        more: page.more,
        source: 'sruti-stage-source',
      });
    }
    if (parts.length === 2) {
      if (!safeId(parts[1])) throw httpError(400, 'Invalid registration identifier.');
      const record = await reader.get(parts[1]);
      if (!record || record.institutionId !== institution)
        throw httpError(404, 'Registration not found.');
      if (record.source !== 'sruti-website') throw httpError(404, 'Registration not found.');
      // Details are disclosed only after demandInstitution('sruti') above.
      // Explicitly return the original intake form, not DynamoDB internals.
      return json(200, {
        record: {
          ...publicRow(record),
          version: record.version,
          registrationType: record.registrationType,
          submission: record.submission,
        },
        reviewAvailable: process.env.M91_SRUTI_REVIEW_WRITES === 'enabled',
        source: 'sruti-stage-source',
      });
    }
    return denied();
  };
}
export const m10RegistrationCutoverRoutes = makeM10RegistrationCutoverRoutes();
