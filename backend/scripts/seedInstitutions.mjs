#!/usr/bin/env node
/** Bootstrap only the two institution records, after the CloudFormation stack is complete. */
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { FRESH_INSTITUTIONS } from './freshStartCore.mjs';

export function institutionSeedItems() {
  return FRESH_INSTITUTIONS.map((item) => structuredClone(item));
}

function parseArgs(args) {
  const execute = args.includes('--execute');
  const dryRun = args.includes('--dry-run');
  if (args.some((arg) => !['--execute', '--dry-run'].includes(arg)) || execute === dryRun) {
    throw Error('Usage: node scripts/seedInstitutions.mjs --dry-run | --execute');
  }
  return { execute };
}

export async function seed({ execute, client, tableName = 'sadhana-dev-m9-institutions' }) {
  if (!/^sadhana-dev-m9-institutions$/.test(tableName))
    throw Error('Only fresh dev institutions table is allowed');
  const items = institutionSeedItems();
  if (!execute) return { writeEnabled: false, table: tableName, records: items, writes: 0 };
  const db = client;
  const doc = DynamoDBDocumentClient.from(db);
  const status = await db.send(new DescribeTableCommand({ TableName: tableName }));
  if (status.Table?.TableStatus !== 'ACTIVE') throw Error(`Table not ACTIVE: ${tableName}`);
  const result = [];
  for (const item of items) {
    try {
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...item,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          },
          ConditionExpression: 'attribute_not_exists(#pk)',
          ExpressionAttributeNames: { '#pk': 'institutionId' },
        }),
      );
      result.push({ institutionId: item.institutionId, result: 'created' });
    } catch (e) {
      if (e?.name !== 'ConditionalCheckFailedException') throw e;
      const got = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: { institutionId: item.institutionId },
          ConsistentRead: true,
        }),
      );
      const existing = got.Item ?? null;
      if (!existing || existing.name !== item.name || existing.status !== 'active') {
        throw Error(
          `Existing institution ${item.institutionId} does not match expected seed; manual review required`,
        );
      }
      result.push({ institutionId: item.institutionId, result: 'already-exists' });
    }
  }
  return { writeEnabled: true, table: tableName, results: result };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { execute } = parseArgs(process.argv.slice(2));
  const db = execute ? new DynamoDBClient({ region: 'us-east-1' }) : null;
  console.log(JSON.stringify(await seed({ execute, client: db }), null, 2));
}
