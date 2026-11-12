#!/usr/bin/env node
/** Read-only parity and readiness report. No API deployment, no writes, no mutations. */
import { writeFileSync } from 'node:fs';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { runTransfer } from './transferOperational.mjs';
import { evaluateM95Cutover, EXPECTED_M95 } from './cutoverGateCore.mjs';
import { listSchedule } from '../src/scheduleStore.ts';
import { listManagedEvents } from '../src/eventManagement.ts';
import { canonicalRecords, makeM95CompatibilityReader } from '../src/compatibility.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--report' || !args[1] || args[1].startsWith('--'))
    throw Error(
      'Usage: node --import tsx scripts/apiCutoverPreflight.mjs --report ./api-cutover-preflight.json',
    );
  if (
    process.env.AWS_REGION !== 'us-east-1' ||
    process.env.AWS_PROFILE !== 'default' ||
    process.env.SADHANA_DATA_MODE !== 'split'
  )
    throw Error('Require AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split');
  const client = new DynamoDBClient({ region: 'us-east-1' });
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  const describe = async (TableName) => client.send(new DescribeTableCommand({ TableName }));
  const transfer = await runTransfer({ doc, describe, mode: 'dry-run' });
  const tableStatuses = {};
  for (const entity of Object.keys(EXPECTED_M95)) {
    const table = `sadhana-dev-m9-${entity}`;
    tableStatuses[table] = (await describe(table)).Table?.TableStatus;
  }
  const reader = makeM95CompatibilityReader(doc);
  const parity = {};
  const claims = {
    sub: 'm95-readonly-parity',
    'cognito:groups': ['raagasudha-admin', 'sruti-admin'],
  };
  for (const inst of ['raaga', 'sruti', 'shared']) {
    const [legacy, m9] = await Promise.all([listSchedule(inst, claims), reader.schedule(inst)]);
    parity[`${inst}.schedule`] = {
      same: canonicalRecords(legacy.records) === canonicalRecords(m9.records),
      legacyCount: legacy.records.length,
      m9Count: m9.records.length,
    };
  }
  for (const inst of ['raaga', 'sruti']) {
    const [legacy, m9] = await Promise.all([
      listManagedEvents(inst, claims),
      reader.managedEvents(inst),
    ]);
    parity[`${inst}.events`] = {
      same: canonicalRecords(legacy.records) === canonicalRecords(m9.records),
      legacyCount: legacy.records.length,
      m9Count: m9.records.length,
    };
  }
  // These are intentionally false until the corresponding existing API route is ported and tested.
  const workflowCoverage = {
    teacherDirectory: false,
    venueDirectory: false,
    classMutations: false,
    calendarMutations: false,
    guardianAndRegistration: false,
    studentAndLearning: false,
    iamAndRollback: false,
  };
  const gate = evaluateM95Cutover({ transfer, parity, tableStatuses, workflowCoverage });
  const result = {
    ...gate,
    sourceTotal: transfer.sourceRecords,
    selectedRecords: transfer.selectedRecords,
    alreadyTransferred: transfer.alreadyTransferred,
    plannedNewWrites: transfer.plannedNewWrites,
    parity,
    workflowCoverage,
    apiCutoverPerformed: false,
  };
  writeFileSync(args[1], JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  if (!gate.operationalReadPilotEligible) process.exitCode = 2;
}
main().catch((e) => {
  console.error('M9.5 CUTOVER PREFLIGHT STOP:', e.message);
  process.exitCode = 1;
});
