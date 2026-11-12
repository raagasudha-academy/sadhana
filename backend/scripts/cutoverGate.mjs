/** Fail-closed release gate. Requires operator-generated and reviewed evidence for every deployed workflow. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const a = process.argv.slice(2);
const get = (k) => {
  const i = a.indexOf(k);
  return i < 0 ? null : a[i + 1];
};
if (a.some((x) => ['--execute', '--deploy', '--enable', '--cutover'].includes(x)))
  throw Error('Evidence gate cannot deploy or cut over');
const input = get('--evidence'),
  output = get('--report');
if (!input || !output || existsSync(output))
  throw Error(
    'Usage: node scripts/cutoverGate.mjs --evidence evidence.json --report NEW_REPORT.json',
  );
const e = JSON.parse(readFileSync(input, 'utf8'));
const required = [
  'isolatedM9Deployment',
  'mediaUploadDownload',
  'cognitoInvitationsOnM9',
  'guardianPortalEndToEnd',
  'raagaWebsiteE2E',
  'srutiWebsiteE2E',
  'learnerHomeworkEndToEnd',
  'crossAcademyNegativeAuth',
  'rollbackRehearsal',
  'infrastructureIAMAsCode',
];
const results = required.map((id) => {
  const x = e.workflows?.[id];
  return {
    id,
    passed: x?.passed === true && typeof x?.evidence === 'string' && x.evidence.trim().length >= 12,
    reference: typeof x?.evidence === 'string' ? x.evidence : null,
  };
});
const pre = e.preflight;
const preflightAccepted =
  pre?.decision?.infrastructurePreflightPassed === true && pre?.readOnly === true;
const approved = preflightAccepted && results.every((x) => x.passed);
const report = {
  schema: 1,
  readOnly: true,
  preflightAccepted,
  results,
  allEvidenceProvided: approved,
  productionCutoverPerformed: false,
  warning:
    'Evidence is operator-supplied and NOT independently authenticated. Independent review and explicit change approval required before any production switch.',
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(
  JSON.stringify(
    {
      report: output,
      preflightAccepted,
      passed: results.filter((r) => r.passed).length,
      total: results.length,
      evidenceComplete: approved,
      productionCutoverPerformed: false,
    },
    null,
    2,
  ),
);
