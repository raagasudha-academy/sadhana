#!/usr/bin/env node
/** M9.2 READ ONLY migration planner. AWS permissions required: DynamoDB Scan only.
 * Writes local private mapping/summary files only; never writes to AWS.
 */
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { SOURCE_TABLES, planMigration } from './migrationPlannerCore.mjs';

function argsOf(args) {
  const a = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      a.help = true;
      continue;
    }
    if (!['--summary', '--plan', '--allow-baseline-drift'].includes(flag))
      throw Error(`Unknown argument ${flag}`);
    if (flag === '--allow-baseline-drift') {
      a.drift = true;
      continue;
    }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`${flag} requires a path`);
    a[flag.slice(2)] = args[++i];
  }
  return a;
}
async function main() {
  const a = argsOf(process.argv.slice(2));
  if (a.help) {
    console.log(
      'AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split node scripts/migrationPlanner.mjs --summary ./m9-summary.json --plan ./m9-private-plan.json',
    );
    return;
  }
  if (!a.summary || !a.plan || resolve(a.summary) === resolve(a.plan))
    throw Error('Provide two different local output paths with --summary and --plan');
  if (
    !process.env.AWS_PROFILE ||
    process.env.AWS_REGION !== 'us-east-1' ||
    process.env.SADHANA_DATA_MODE !== 'split'
  )
    throw Error('Set AWS_PROFILE, AWS_REGION=us-east-1 and SADHANA_DATA_MODE=split explicitly');
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  const tables = {};
  for (const [domain, table] of Object.entries(SOURCE_TABLES)) {
    const rows = [];
    let cursor;
    do {
      const page = await db.send(
        new ScanCommand({
          TableName: table,
          ConsistentRead: true,
          Limit: 100,
          ExclusiveStartKey: cursor,
        }),
      );
      rows.push(...(page.Items || []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > 20000) throw Error(`Safety stop: ${table} exceeded 20000 records`);
    } while (cursor);
    tables[domain] = rows;
  }
  const result = planMigration(tables, { strictBaseline: !a.drift });
  const summaryPath = resolve(a.summary),
    planPath = resolve(a.plan);
  for (const path of [summaryPath, planPath]) mkdirSync(dirname(path), { recursive: true });
  // Summary is counts/errors only. Individual source keys and identities remain in 0600 private plan.
  const safeSummary = {
    ...result.summary,
    problemCodes: Object.fromEntries(
      [...new Set(result.problems.map((p) => p.code))].map((code) => [
        code,
        result.problems.filter((p) => p.code === code).length,
      ]),
    ),
    warningCodes: Object.fromEntries(
      [...new Set(result.warnings.map((p) => p.code))].map((code) => [
        code,
        result.warnings.filter((p) => p.code === code).length,
      ]),
    ),
  };
  writeFileSync(summaryPath, JSON.stringify(safeSummary, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  writeFileSync(
    planPath,
    JSON.stringify(
      {
        schema: 1,
        readOnly: true,
        notice:
          'PRIVATE: includes source keys/identifiers and hash fingerprints. Planning only, not transformed DynamoDB items.',
        ...result,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  chmodSync(summaryPath, 0o600);
  chmodSync(planPath, 0o600);
  console.log(
    JSON.stringify({ summary: summaryPath, privatePlan: planPath, ...safeSummary }, null, 2),
  );
  if (result.problems.length) process.exitCode = 2;
}
main().catch((e) => {
  console.error('M9 READ-ONLY STOP:', e.message);
  process.exitCode = 1;
});
