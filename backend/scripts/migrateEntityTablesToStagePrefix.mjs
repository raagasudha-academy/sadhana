#!/usr/bin/env node
/** Additive migration from legacy middle-stage tables to environment-first tables. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  DynamoDBClient,
  DescribeContinuousBackupsCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ENTITY_NAMES } from '../src/entityTables.mjs';
import { M9_SCHEMA } from './schema.mjs';

const REGION = 'us-east-1';
const ACCOUNT = '627821644317';
const ACKS = Object.freeze({
  dev: 'MIGRATE_DEV_ENTITY_TABLES',
  prod: 'MIGRATE_PROD_ENTITY_TABLES',
});
const tableSuffix = (entity) => (entity === 'audit' ? 'audit-records' : entity);
const tableNames = (stage, entity) => {
  const schema = M9_SCHEMA.find((item) => item.tableName === `sadhana-dev-${entity}`);
  if (!schema) throw new Error(`Missing M9 schema for ${entity}.`);
  return {
    source: `sadhana-${stage}-${tableSuffix(entity)}`,
    target: `${stage}-sadhana-${tableSuffix(entity)}`,
    key: schema.partitionKey,
  };
};
const intakeTables = (stage) => [
  {
    name: 'sruti-intake',
    source: 'sruti-student-registrations',
    target: `${stage}-sruti-student-registrations`,
    key: 'registrationId',
    allowTargetIndexSuperset: true,
  },
  ...(stage === 'prod'
    ? [
        {
          name: 'raagasudha-intake',
          source: 'raagasudha-student-registrations',
          target: 'prod-raagasudha-student-registrations',
          key: 'registrationId',
          allowTargetIndexSuperset: true,
        },
      ]
    : []),
];
const fail = (message) => {
  throw new Error(`STOP: ${message}`);
};
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value instanceof Set
      ? [...value].map(stable).sort()
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])]),
          )
        : value;
const json = (value) => JSON.stringify(stable(value));
const sha = (value) => createHash('sha256').update(value).digest('hex');

function parseArgs(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index < 0 ? '' : argv[index + 1] || '';
  };
  if (argv.includes('--help')) {
    console.log(
      'Plan: AWS_PROFILE=raagasudha AWS_REGION=us-east-1 node backend/scripts/migrateEntityTablesToStagePrefix.mjs --stage dev --plan\nApply: ... --stage dev --apply --confirm MIGRATE_DEV_ENTITY_TABLES --expected-fingerprint <sha256>',
    );
    process.exit(0);
  }
  const stage = value('--stage');
  if (!['dev', 'prod'].includes(stage)) fail('Pass --stage dev or --stage prod.');
  const plan = argv.includes('--plan');
  const apply = argv.includes('--apply');
  if (plan === apply) fail('Choose exactly one of --plan or --apply.');
  const confirm = value('--confirm');
  const expectedFingerprint = value('--expected-fingerprint');
  if (plan && (confirm || expectedFingerprint))
    fail('Plan mode does not accept write acknowledgements.');
  if (apply && (confirm !== ACKS[stage] || !/^[a-f0-9]{64}$/.test(expectedFingerprint)))
    fail(`Apply requires --confirm ${ACKS[stage]} and the reviewed fingerprint.`);
  const allowed = new Set(['--stage', '--plan', '--apply', '--confirm', '--expected-fingerprint']);
  for (let i = 0; i < argv.length; i++) {
    if (allowed.has(argv[i])) {
      if (['--stage', '--confirm', '--expected-fingerprint'].includes(argv[i])) i++;
      continue;
    }
    fail(`Unexpected argument ${argv[i]}.`);
  }
  return { stage, mode: apply ? 'apply' : 'plan', expectedFingerprint };
}

async function scan(tableName) {
  const rows = [];
  let cursor;
  do {
    const page = await client.send(
      new ScanCommand({ TableName: tableName, ConsistentRead: true, ExclusiveStartKey: cursor }),
    );
    rows.push(...(page.Items || []));
    cursor = page.LastEvaluatedKey;
    if (rows.length > 50000) fail(`${tableName} exceeded the 50000-item safety limit.`);
  } while (cursor);
  return rows;
}

async function describe(tableName) {
  const table = (await client.send(new DescribeTableCommand({ TableName: tableName }))).Table;
  const backup = await client.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));
  return {
    table,
    pitr: backup.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
      ?.PointInTimeRecoveryStatus,
  };
}

function schemaShape(table) {
  return JSON.stringify({
    keys: (table.KeySchema || []).map((item) => `${item.KeyType}:${item.AttributeName}`).sort(),
    indexes: (table.GlobalSecondaryIndexes || [])
      .map(
        (index) =>
          `${index.IndexName}:${index.KeySchema.map(
            (item) => `${item.KeyType}:${item.AttributeName}`,
          )
            .sort()
            .join(',')}`,
      )
      .sort(),
  });
}

async function buildPlan(stage) {
  if (process.env.AWS_REGION !== REGION || !process.env.AWS_PROFILE)
    fail('Set AWS_PROFILE and AWS_REGION=us-east-1 explicitly.');
  const account = execFileSync(
    'aws',
    ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', REGION],
    { encoding: 'utf8', env: process.env },
  ).trim();
  if (account !== ACCOUNT) fail(`AWS account is ${account}, expected ${ACCOUNT}.`);

  const tables = {};
  const allRows = [];
  const mappings = [
    ...ENTITY_NAMES.map((entity) => ({ ...tableNames(stage, entity), name: entity })),
    ...intakeTables(stage),
  ];
  for (const mapping of mappings) {
    const entity = mapping.name;
    const source = await describe(mapping.source);
    const target = await describe(mapping.target);
    if (source.table.TableStatus !== 'ACTIVE' || target.table.TableStatus !== 'ACTIVE')
      fail(`${entity} source or target is not ACTIVE.`);
    const sourceShape = schemaShape(source.table);
    const targetShape = schemaShape(target.table);
    const sourceIndexes = JSON.parse(sourceShape).indexes;
    const targetIndexes = JSON.parse(targetShape).indexes;
    const samePartitionKey =
      JSON.parse(sourceShape).keys.join('|') === JSON.parse(targetShape).keys.join('|');
    const compatibleIndexes = mapping.allowTargetIndexSuperset
      ? sourceIndexes.every((index) => targetIndexes.includes(index))
      : sourceIndexes.join('|') === targetIndexes.join('|');
    if (!samePartitionKey || !compatibleIndexes)
      fail(`${entity} source and target key/index schemas differ.`);
    if (target.pitr !== 'ENABLED' || target.table.DeletionProtectionEnabled !== true)
      fail(`${mapping.target} is not protected by PITR and deletion protection.`);

    const sourceRows = await scan(mapping.source);
    const targetRows = await scan(mapping.target);
    const sourceByKey = new Map();
    for (const row of sourceRows) {
      const key = row[mapping.key];
      if (typeof key !== 'string' || !key)
        fail(`${mapping.source} has an item without ${mapping.key}.`);
      if (sourceByKey.has(key)) fail(`${mapping.source} contains duplicate ${mapping.key} values.`);
      sourceByKey.set(key, row);
    }
    const targetByKey = new Map(targetRows.map((row) => [row[mapping.key], row]));
    for (const [key, row] of targetByKey) {
      const sourceRow = sourceByKey.get(key);
      if (sourceRow && json(sourceRow) !== json(row))
        fail(`${mapping.target} has a conflicting ${mapping.key}; no records were written.`);
    }
    const ordered = [...sourceRows].sort((a, b) =>
      String(a[mapping.key]).localeCompare(String(b[mapping.key])),
    );
    const digest = sha(ordered.map(json).join('\n'));
    allRows.push(`${entity}:${digest}`);
    tables[entity] = {
      ...mapping,
      sourceRows,
      targetKeys: new Set(targetByKey.keys()),
      sourceCount: sourceRows.length,
      existingSourceRows: [...sourceByKey.keys()].filter((key) => targetByKey.has(key)).length,
      rowsFingerprint: digest,
    };
  }
  const fingerprint = sha(`${stage}\n${allRows.join('\n')}`);
  return {
    tables,
    summary: {
      stage,
      mode: 'additive-copy',
      entities: Object.fromEntries(
        Object.entries(tables).map(([entity, value]) => [
          entity,
          {
            source: value.source,
            target: value.target,
            sourceItems: value.sourceCount,
            alreadyPresentIdentically: value.existingSourceRows,
            newItems: value.sourceCount - value.existingSourceRows,
            sourceFingerprint: value.rowsFingerprint,
          },
        ]),
      ),
      fingerprint,
      noDeletes: true,
      noOverwrites: true,
    },
  };
}

async function applyPlan(tables) {
  for (const [entity, table] of Object.entries(tables)) {
    for (const row of table.sourceRows) {
      const keyValue = row[table.key];
      if (table.targetKeys.has(keyValue)) continue;
      try {
        await client.send(
          new PutCommand({
            TableName: table.target,
            Item: row,
            ConditionExpression: 'attribute_not_exists(#pk)',
            ExpressionAttributeNames: { '#pk': table.key },
          }),
        );
      } catch (error) {
        if (error?.name !== 'ConditionalCheckFailedException') throw error;
        const current = (
          await client.send(
            new GetCommand({
              TableName: table.target,
              Key: { [table.key]: keyValue },
              ConsistentRead: true,
            }),
          )
        ).Item;
        if (!current || json(current) !== json(row))
          fail(`${entity} encountered a concurrent, non-identical target item.`);
      }
    }
  }
  for (const [entity, table] of Object.entries(tables)) {
    const targetRows = await scan(table.target);
    const targetByKey = new Map(targetRows.map((row) => [row[table.key], row]));
    for (const sourceRow of table.sourceRows) {
      const targetRow = targetByKey.get(sourceRow[table.key]);
      if (!targetRow || json(targetRow) !== json(sourceRow))
        fail(`${entity} post-copy verification failed.`);
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(args.stage);
  if (args.mode === 'plan') {
    console.log(JSON.stringify(plan.summary, null, 2));
  } else {
    if (plan.summary.fingerprint !== args.expectedFingerprint)
      fail('Source data changed since planning; run --plan again.');
    console.log(JSON.stringify({ ...plan.summary, readOnly: false, preflight: 'passed' }, null, 2));
    await applyPlan(plan.tables);
    console.log(JSON.stringify({ result: 'COPY_PASS', noDeletes: true, noOverwrites: true }));
  }
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
