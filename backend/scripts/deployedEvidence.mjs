/** Read-only evidence collection for deployed M9 infrastructure and negative auth.
 * Does not create resources, send write requests, or alter any feature flags.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  M9_TABLES,
  REQUIRED_ACTIONS,
  isProtected,
  pitrEnabled,
  evaluateIamSim,
  deniedWithoutCredentials,
  evidenceDecision,
} from './deploymentEvidenceCore.mjs';
const argv = process.argv.slice(2);
function option(key) {
  const i = argv.indexOf(key);
  return i < 0 ? null : argv[i + 1] || null;
}
function requireOption(key) {
  const value = option(key);
  if (!value || value.startsWith('--')) throw new Error(`Missing ${key}`);
  return value;
}
if (argv.includes('--execute') || argv.includes('--cutover') || argv.includes('--deploy'))
  throw new Error('This command is read-only; execute/deploy/cutover are prohibited.');
const outputPath = requireOption('--report');
const lambdaName = requireOption('--lambda-name');
const apiUrl = option('--api-base-url');
const probePath = option('--probe-path') || '/schedule?institution=raaga';
if (apiUrl && !/^https:\/\//.test(apiUrl)) throw Error('Only HTTPS API URLs are supported.');
if (!/^\/[a-zA-Z0-9/_?=&.-]+$/.test(probePath) || probePath.includes('//'))
  throw Error('Unsafe probe path.');
const region = process.env.AWS_REGION || 'us-east-1';
const profile = process.env.AWS_PROFILE || 'default';
function aws(service, operation, args = []) {
  const params = [
    service,
    operation,
    ...args,
    '--profile',
    profile,
    '--region',
    region,
    '--output',
    'json',
  ];
  const response = execFileSync('aws', params, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(response);
}
const account = aws('sts', 'get-caller-identity');
const tables = [];
for (const domain of M9_TABLES) {
  const name = `sadhana-dev-m9-${domain}`;
  const entry = { domain, name, activeProtected: false, pitrEnabled: false };
  try {
    const table = aws('dynamodb', 'describe-table', ['--table-name', name]);
    entry.activeProtected = isProtected(table);
    entry.gsiCount = (table.Table?.GlobalSecondaryIndexes || []).length;
    const backups = aws('dynamodb', 'describe-continuous-backups', ['--table-name', name]);
    entry.pitrEnabled = pitrEnabled(backups);
  } catch (err) {
    entry.error = String(err?.message || err).slice(0, 180);
  }
  tables.push(entry);
}
let identity = null,
  iam = null;
try {
  const config = aws('lambda', 'get-function-configuration', ['--function-name', lambdaName]);
  identity = {
    functionName: config.FunctionName,
    roleArn: config.Role,
    runtime: config.Runtime,
    lastModified: config.LastModified,
    // Deliberately report flag *presence*, never environment values or secrets.
    configFlagsPresent: Object.keys(config.Environment?.Variables || {})
      .filter((k) => /^(M9|M95|SADHANA_DATA_MODE|SADHANA_TABLE_NAME)/.test(k))
      .sort(),
  };
  const roleArn = identity.roleArn;
  if (roleArn) {
    const tableArns = M9_TABLES.map(
      (d) => `arn:aws:dynamodb:${region}:${account.Account}:table/sadhana-dev-m9-${d}`,
    );
    const sim = aws('iam', 'simulate-principal-policy', [
      '--policy-source-arn',
      roleArn,
      '--action-names',
      ...REQUIRED_ACTIONS,
      '--resource-arns',
      ...tableArns,
      '--max-items',
      '1000',
    ]);
    iam = evaluateIamSim(sim);
    iam.requestedResources = tableArns.length;
    iam.isPartial = Boolean(sim.IsTruncated || sim.Marker);
    if (iam.isPartial) iam.complete = false;
  }
} catch (e) {
  iam = { complete: false, error: String(e?.message || e).slice(0, 300) };
}
let anonymous = null;
if (apiUrl) {
  const url = new URL(probePath, apiUrl.endsWith('/') ? apiUrl : apiUrl + '/');
  const codes = [];
  for (const headers of [{}, { authorization: 'Bearer deliberately-invalid-m9-smoke-token' }]) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(12000),
        redirect: 'manual',
      });
      codes.push(response.status);
      await response.body?.cancel();
    } catch (e) {
      codes.push(`REQUEST_ERROR:${e?.name || 'Unknown'}`);
    }
  }
  anonymous = {
    path: probePath,
    statusCodes: codes,
    passed: deniedWithoutCredentials(codes),
    caveat:
      'Only unauthenticated/invalid-token denial. Does not prove institution isolation or guardian revocation.',
  };
}
const decision = evidenceDecision({ tables, identity, iam, anonymous });
const report = {
  schema: 1,
  milestone: 'M9_DEPLOYED_EVIDENCE',
  readOnly: true,
  canExecute: false,
  generatedAt: new Date().toISOString(),
  region,
  accountId: account.Account,
  tables,
  lambda: identity,
  iamSimulation: iam,
  anonymousProbe: anonymous,
  decision,
  fullCutoverReady: false,
};
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(
  JSON.stringify(
    { report: outputPath, tableCount: tables.length, decision, iamError: iam?.error || null },
    null,
    2,
  ),
);
