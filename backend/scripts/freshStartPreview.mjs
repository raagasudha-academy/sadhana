#!/usr/bin/env node
/** Generates a *local* fresh-start plan. Never connects to AWS. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeFreshStartPlan } from './freshStartCore.mjs';

const argv = process.argv.slice(2);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i < 0 ? fallback : argv[i + 1];
};
if (
  argv.some(
    (v) =>
      !['--environment', '--output'].includes(v) &&
      !argv.some((a, i) => ['--environment', '--output'].includes(a) && argv[i + 1] === v),
  )
) {
  throw new Error(
    'Usage: node scripts/freshStartPreview.mjs [--environment dev] [--output ./fresh-start-preview.json]',
  );
}
const plan = makeFreshStartPlan({ environment: valueOf('--environment', 'dev') });
const output = resolve(valueOf('--output', './fresh-start-preview.json'));
writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'w', mode: 0o600 });
console.log(
  JSON.stringify(
    {
      output,
      planType: plan.planType,
      readOnly: plan.readOnly,
      canExecute: plan.canExecute,
      physicalTables: plan.physicalTables.length,
      initialSeeds: plan.initialSeedCount,
      legacySourceRecordsToCopy: plan.legacySourceRecordsToCopy,
      operationalReadiness: plan.operationalReadiness,
    },
    null,
    2,
  ),
);
