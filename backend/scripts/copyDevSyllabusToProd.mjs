#!/usr/bin/env node
/** Additive copy of academy syllabus rows from dev to production. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  DynamoDBClient,
  DescribeContinuousBackupsCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const ACCOUNT = '627821644317';
const ACK = 'COPY_DEV_SYLLABUS_TO_PROD';
const INSTITUTIONS = ['raaga', 'sruti'];
const SOURCE = 'dev-sadhana-homework';
const TARGET = 'prod-sadhana-homework';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;
const json = (value) => JSON.stringify(stable(value));
const fail = (message) => {
  throw new Error(`STOP: ${message}`);
};

function args(argv) {
  const plan = argv.includes('--plan');
  const apply = argv.includes('--apply');
  const confirm = argv[argv.indexOf('--confirm') + 1] || '';
  const expected = argv[argv.indexOf('--expected-fingerprint') + 1] || '';
  if (plan === apply) fail('Choose exactly one of --plan or --apply.');
  if (plan && (argv.includes('--confirm') || argv.includes('--expected-fingerprint')))
    fail('Plan mode does not accept write acknowledgements.');
  if (apply && (confirm !== ACK || !/^[a-f0-9]{64}$/.test(expected)))
    fail(`Apply requires --confirm ${ACK} and the reviewed plan fingerprint.`);
  return { apply, expected };
}

async function query(table, institution) {
  const items = [];
  let cursor;
  do {
    const page = await client.send(
      new QueryCommand({
        TableName: table,
        IndexName: 'ClassHomeworkIndex',
        KeyConditionExpression: '#classId = :classId',
        FilterExpression: '#recordType = :recordType AND #category = :category',
        ExpressionAttributeNames: {
          '#classId': 'classId',
          '#recordType': 'recordType',
          '#category': 'category',
        },
        ExpressionAttributeValues: {
          ':classId': `LIBRARY#${institution}`,
          ':recordType': 'learning-resource',
          ':category': 'syllabus',
        },
        ConsistentRead: false,
        ExclusiveStartKey: cursor,
      }),
    );
    items.push(...(page.Items || []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function tableInfo(tableName) {
  const table = (await client.send(new DescribeTableCommand({ TableName: tableName }))).Table;
  const backup = await client.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));
  return {
    table,
    pitr: backup.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
      ?.PointInTimeRecoveryStatus,
  };
}

async function run() {
  const options = args(process.argv.slice(2));
  if (!process.env.AWS_PROFILE || process.env.AWS_REGION !== REGION)
    fail('Set AWS_PROFILE and AWS_REGION=us-east-1 explicitly.');
  const account = execFileSync(
    'aws',
    ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', REGION],
    { encoding: 'utf8', env: process.env },
  ).trim();
  if (account !== ACCOUNT) fail('AWS account mismatch.');

  const [sourceInfo, targetInfo] = await Promise.all([tableInfo(SOURCE), tableInfo(TARGET)]);
  for (const [label, info] of [
    ['source', sourceInfo],
    ['production target', targetInfo],
  ]) {
    if (
      info.table?.TableStatus !== 'ACTIVE' ||
      info.table.DeletionProtectionEnabled !== true ||
      info.pitr !== 'ENABLED'
    )
      fail(`${label} table must be ACTIVE with deletion protection and PITR.`);
  }

  const records = [];
  for (const institution of INSTITUTIONS) {
    const sourceRows = await query(SOURCE, institution);
    for (const row of sourceRows) {
      if (!row.homeworkId || row.institutionId !== institution)
        fail(`Invalid ${institution} syllabus row; no production writes were made.`);
      if (row.mediaKey)
        fail(`Syllabus row ${row.homeworkId} has a media key; copy its media before migrating.`);
      const item = { ...row };
      delete item.createdBy;
      delete item.updatedBy;
      if (Object.keys(item).some((key) => /cognito|userPool/i.test(key)))
        fail(`Syllabus row ${row.homeworkId} contains identity metadata.`);
      records.push(item);
    }
  }
  records.sort((a, b) => a.homeworkId.localeCompare(b.homeworkId));
  const fingerprint = createHash('sha256').update(json(records)).digest('hex');
  if (options.apply && options.expected !== fingerprint)
    fail(`Plan changed. Review the new fingerprint: ${fingerprint}`);

  const targets = await Promise.all(
    records.map(async (item) => {
      const existing = await client.send(
        new GetCommand({
          TableName: TARGET,
          Key: { homeworkId: item.homeworkId },
          ConsistentRead: true,
        }),
      );
      if (existing.Item && json(existing.Item) !== json(item))
        fail(`Production key ${item.homeworkId} already exists with different content.`);
      return { item, exists: !!existing.Item };
    }),
  );
  const summary = {
    readOnly: !options.apply,
    account,
    source: SOURCE,
    destination: TARGET,
    records: records.length,
    byInstitution: Object.fromEntries(
      INSTITUTIONS.map((institution) => [
        institution,
        records.filter((row) => row.institutionId === institution).length,
      ]),
    ),
    draftRecords: records.filter((row) => row.status === 'draft').length,
    publishedRecords: records.filter((row) => row.status === 'published').length,
    devCreatorLinksRemoved: true,
    mediaReferences: 0,
    existingExactRecords: targets.filter((target) => target.exists).length,
    recordsToAdd: targets.filter((target) => !target.exists).length,
    fingerprint,
  };
  if (!options.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  for (const { item, exists } of targets) {
    if (!exists) {
      await client.send(
        new PutCommand({
          TableName: TARGET,
          Item: item,
          ConditionExpression: 'attribute_not_exists(#pk)',
          ExpressionAttributeNames: { '#pk': 'homeworkId' },
        }),
      );
    }
    const verified = await client.send(
      new GetCommand({
        TableName: TARGET,
        Key: { homeworkId: item.homeworkId },
        ConsistentRead: true,
      }),
    );
    if (json(verified.Item) !== json(item)) fail(`Verification failed for ${item.homeworkId}.`);
  }
  console.log(
    JSON.stringify({ ...summary, readOnly: false, result: 'SYLLABUS_COPY_PASS' }, null, 2),
  );
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
