#!/usr/bin/env node
/** READ ONLY: verifies known M8 HOLD relationships against live DynamoDB.
 * Optional Cognito/S3/website checks are read-only and MUST be configured explicitly.
 * No approval-file modifications and no destructive AWS APIs.
 */
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { typeOf, safeRelation, storageReferences } from './crossSystemReviewCore.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
};
if (args.includes('--help')) {
  console.log(
    'node scripts/crossSystemReview.mjs --plan ./cleanup-private.json --output ./cross-system-summary.json [--cognito-pool USER_POOL_ID] [--website-table DYNAMODB_TABLE] [--media-bucket S3_BUCKET]',
  );
  process.exit(0);
}
const REGION = 'us-east-1',
  ACCOUNT = '627821644317';
const EXPECTED = {
  calendar: 'sadhana-dev-calendar',
  students: 'sadhana-dev-students',
  learning: 'sadhana-dev-learning',
  admin: 'sadhana-dev-admin',
  audit: 'sadhana-dev-audit',
};
function stop(reason) {
  throw new Error(reason);
}
const planPath = arg('--plan'),
  outPath = arg('--output');
if (!planPath || !outPath || resolve(planPath) === resolve(outPath))
  stop('Supply distinct --plan and --output paths');
if (!process.env.AWS_PROFILE) stop('AWS_PROFILE must be explicit');
if ((process.env.AWS_REGION || REGION) !== REGION || process.env.SADHANA_DATA_MODE !== 'split')
  stop('Expected us-east-1 split mode');
const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'));
if (
  plan.schema !== 1 ||
  plan.rows?.length !== 51 ||
  JSON.stringify(plan.tables) !== JSON.stringify(EXPECTED)
)
  stop('Unexpected private plan; do not proceed');
const holds = plan.rows.filter((r) => r.kind === 'HOLD');
if (holds.length !== 19 || plan.rows.filter((r) => r.kind === 'COUNTER').length !== 2)
  stop('Unexpected review cohort');
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
const digest = (v) =>
  createHash('sha256')
    .update(JSON.stringify(stable(v)))
    .digest('hex');

async function main() {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand, GetCommand } = await import('@aws-sdk/lib-dynamodb');
  const raw = new DynamoDBClient({ region: REGION });
  const db = DynamoDBDocumentClient.from(raw);
  async function scan(table) {
    const rows = [];
    let cursor;
    do {
      const page = await db.send(
        new ScanCommand({
          TableName: table,
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
          Limit: 100,
        }),
      );
      rows.push(...(page.Items || []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > 2500) stop('Unexpected table size; review script scope');
    } while (cursor);
    return rows;
  }
  const tables = {};
  for (const t of ['students', 'learning', 'admin']) tables[t] = await scan(EXPECTED[t]);
  const index = new Map();
  for (const [table, items] of Object.entries(tables))
    for (const item of items) index.set(`${table}\u0000${item.PK}\u0000${item.SK}`, item);
  const allTargets = plan.rows.filter((r) => ['students', 'learning', 'admin'].includes(r.table));
  for (const r of allTargets) {
    const item = index.get(`${r.table}\u0000${r.PK}\u0000${r.SK}`);
    if (!item || digest(item) !== r.fingerprint)
      stop('A reviewed DynamoDB record has changed. STOP; regenerate the private cleanup plan.');
  }
  const students = plan.rows.filter(
    (r) => r.table === 'students' && r.PK === 'OPS#GLOBAL#STUDENT' && r.SK.startsWith('ITEM#'),
  );
  const families = plan.rows.filter(
    (r) => r.table === 'students' && r.PK === 'OPS#GLOBAL#FAMILY' && r.SK.startsWith('ITEM#'),
  );
  if (students.length !== 5 || families.length !== 1) stop('Student/family baseline changed');
  const studentIds = new Set(
    students.map((r) => index.get(`${r.table}\u0000${r.PK}\u0000${r.SK}`)?.id),
  );
  const familyId = index.get(
    `${families[0].table}\u0000${families[0].PK}\u0000${families[0].SK}`,
  )?.id;
  if (studentIds.size !== 5 || studentIds.has(undefined) || !familyId)
    stop('Unable to validate five students and family');
  const websiteTable = arg('--website-table');
  const cognitoPool = arg('--cognito-pool');
  const mediaBucket = arg('--media-bucket');
  if (
    websiteTable &&
    (!/^[A-Za-z0-9_.-]{3,255}$/.test(websiteTable) ||
      Object.values(EXPECTED).includes(websiteTable))
  )
    stop('Website table must be a separate explicitly named DynamoDB table');
  let websiteRows = null;
  if (websiteTable) websiteRows = await scan(websiteTable);
  let cognito = null;
  if (cognitoPool) {
    const { CognitoIdentityProviderClient, ListUsersCommand } =
      await import('@aws-sdk/client-cognito-identity-provider');
    cognito = { client: new CognitoIdentityProviderClient({ region: REGION }), ListUsersCommand };
  }
  let s3 = null;
  if (mediaBucket) {
    const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    s3 = { client: new S3Client({ region: REGION }), HeadObjectCommand };
  }
  const report = [];
  for (let i = 0; i < holds.length; i++) {
    const r = holds[i],
      item = index.get(`${r.table}\u0000${r.PK}\u0000${r.SK}`),
      type = typeOf(r);
    const entry = {
      label: `H${String(i + 1).padStart(2, '0')}`,
      table: r.table,
      type,
      exists: true,
      unchanged: true,
      decision: 'HOLD',
      checks: [],
      manualActions: [],
    };
    const relation = safeRelation(item, studentIds, familyId);
    if (relation !== null)
      entry.checks.push({ name: 'test-cohort-reference', status: relation ? 'MATCH' : 'MISMATCH' });
    if (type === 'guardian-access') {
      const matches = studentIds.has(item.studentId);
      entry.checks.push({ name: 'linked-test-student', status: matches ? 'MATCH' : 'MISMATCH' });
      const sub = r.PK.split('#').slice(2).join('#');
      if (cognito && sub) {
        const result = await cognito.client.send(
          new cognito.ListUsersCommand({
            UserPoolId: cognitoPool,
            Filter: `sub = "${sub}"`,
            Limit: 2,
          }),
        );
        entry.checks.push({
          name: 'cognito-identity-exists',
          status: result.Users?.length ? 'EXISTS' : 'NOT_FOUND',
        });
      } else entry.checks.push({ name: 'cognito-identity-exists', status: 'NOT_CHECKED' });
      entry.manualActions.push(
        'Confirm account is not required for another family or staff role; removal of this link does NOT disable Cognito login',
      );
    }
    if (type === 'website-import' || type === 'website-identity-mapping') {
      const reg = item.registrationId || item.sourceRegistrationId;
      if (type === 'website-import')
        entry.checks.push({
          name: 'family-is-test-family',
          status: item.familyId === familyId ? 'MATCH' : 'MISMATCH',
        });
      if (type === 'website-identity-mapping')
        entry.checks.push({
          name: 'identity-lock-student',
          status:
            studentIds.has(item.studentId) || studentIds.has(item.identityStudentId)
              ? 'MATCH'
              : item.studentId || item.identityStudentId
                ? 'MISMATCH'
                : 'UNRESOLVED',
        });
      if (websiteRows && reg) {
        const hits = websiteRows.filter((x) => x.registrationId === reg || x.id === reg);
        entry.checks.push({
          name: 'external-website-registration',
          status:
            hits.length === 1
              ? 'FOUND_REVIEW_STATUS_LOCALLY'
              : hits.length === 0
                ? 'NOT_FOUND'
                : 'AMBIGUOUS',
        });
      } else entry.checks.push({ name: 'external-website-registration', status: 'NOT_CHECKED' });
      entry.manualActions.push(
        'Check external registration import status, identity lock, and registration-reset workflow before Sadhana mapping removal',
      );
    }
    if (type === 'homework-assignment' || type === 'homework-material') {
      const related =
        type === 'homework-assignment'
          ? tables.learning.filter((x) => x.homeworkId === item.id)
          : tables.learning.filter((x) => x.id === item.homeworkId);
      const unrelated = related.filter((x) => x.studentId && !studentIds.has(x.studentId));
      entry.checks.push({
        name: 'non-test-student-references',
        status: unrelated.length ? 'FOUND' : 'NONE_IN_LEARNING_TABLE',
      });
      entry.checks.push({ name: 'class-scoped-assignment', status: 'YES' });
      entry.manualActions.push(
        'Confirm class-level assignment and materials are test-only; class membership may extend beyond this cohort',
      );
    }
    if (type === 'student-media-metadata') {
      entry.checks.push({
        name: 'linked-test-student',
        status: studentIds.has(item.studentId) ? 'MATCH' : 'MISMATCH',
      });
      entry.manualActions.push(
        'Check underlying S3 object retention independently; removing metadata does not remove an S3 object',
      );
    }
    if (['homework-assignment', 'homework-material', 'student-media-metadata'].includes(type)) {
      const refs = storageReferences(item, mediaBucket);
      if (!refs.length)
        entry.checks.push({ name: 'storage-objects', status: 'KEY_NOT_DISCOVERED' });
      else if (s3) {
        let found = 0,
          missing = 0;
        for (const ref of refs) {
          try {
            await s3.client.send(new s3.HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
            found++;
          } catch (e) {
            if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) missing++;
            else stop('S3 HEAD failed; verify read permissions, bucket and region');
          }
        }
        entry.checks.push({
          name: 'storage-objects',
          status: `EXISTS_${found}_MISSING_${missing}`,
        });
      } else entry.checks.push({ name: 'storage-objects', status: 'NOT_CHECKED' });
    }
    if (entry.checks.some((c) => ['MISMATCH', 'FOUND', 'AMBIGUOUS'].includes(c.status)))
      entry.decision = 'BLOCKED';
    report.push(entry);
  }
  const counters = plan.rows
    .filter((r) => r.kind === 'COUNTER')
    .map((r, i) => {
      const item = index.get(`${r.table}\u0000${r.PK}\u0000${r.SK}`);
      return {
        label: `C${i + 1}`,
        exists: !!item,
        unchanged: !!item && digest(item) === r.fingerprint,
        numericCounter: Number.isSafeInteger(item?.value) && item.value >= 0,
        status: 'REVIEW_ONLY',
        note: 'Do not reset until every dependent record and external identity has been reconciled',
      };
    });
  const summary = {
    schema: 1,
    readOnly: true,
    containsPrivateKeys: false,
    containsPersonalDetails: false,
    awsRegion: REGION,
    accountExpected: ACCOUNT,
    planUnchanged: true,
    reviewCount: report.length,
    counts: { HOLD: 19, CANDIDATE: 30, COUNTER: 2 },
    externalChecksConfigured: {
      cognito: !!cognitoPool,
      website: !!websiteTable,
      media: !!mediaBucket,
    },
    rows: report,
    counters,
    executionAllowed: false,
    notice:
      'Evidence only. No approval values changed. NOT_CHECKED and class-scoped rows require manual verification. Do not run the cleanup --apply based only on this report.',
  };
  writeFileSync(resolve(outPath), JSON.stringify(summary, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  chmodSync(resolve(outPath), 0o600);
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        output: outPath,
        holdRecords: report.length,
        blocked: report.filter((x) => x.decision === 'BLOCKED').length,
        notChecked: report.filter((x) =>
          x.checks.some((c) =>
            ['NOT_CHECKED', 'KEY_NOT_DISCOVERED', 'UNRESOLVED'].includes(c.status),
          ),
        ).length,
        externalChecksConfigured: summary.externalChecksConfigured,
        countersReviewed: counters.length,
        applyEnabled: false,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error('M8 CROSS-SYSTEM SAFE STOP:', e.name === 'Error' ? e.message : e.name);
  process.exitCode = 1;
});
