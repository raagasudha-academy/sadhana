import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_PARITY,
  DEPLOYED_CHECKS,
  readinessChecks,
  validParityReport,
} from '../readinessEvidenceCore.mjs';
const now = Date.parse('2026-11-03T17:00:00Z');
const parity = () => ({
  schema: 1,
  readOnly: true,
  target: 'sadhana-dev-m9',
  region: 'us-east-1',
  verifiedAt: new Date(now).toISOString(),
  parity: Object.fromEntries(
    REQUIRED_PARITY.map((key) => [
      key,
      { same: true, legacyCount: 3, m9Count: 3, legacyDigest: 'abc', m9Digest: 'abc' },
    ]),
  ),
});
const data = {
  seededInstitutions: ['raaga', 'sruti'],
  counts: { classes: 22, sessions: 423, events: 6, venues: 3, people: 7 },
};
test('matching fresh parity evidence verifies schedule and directories', () => {
  const result = readinessChecks({ ...data, parityReport: parity() });
  // Freshness uses actual clock; use deterministic validParityReport separately.
  assert.equal(validParityReport(parity(), { now }), true);
  assert.equal(result.checks.institutionsSeeded, true);
  assert.equal(result.checks.operationalCounts, true);
});
test('stale and tampered reports rejected', () => {
  assert.equal(validParityReport(parity(), { now: now + 16 * 60_000 }), false);
  let r = parity();
  r.parity['sruti.schedule'].same = false;
  assert.equal(validParityReport(r, { now }), false);
  r = parity();
  r.parity['raaga.venues'].m9Digest = 'wrong';
  assert.equal(validParityReport(r, { now }), false);
  r = parity();
  r.parity['raaga.events'].m9Count = 4;
  assert.equal(validParityReport(r, { now }), false);
  r = parity();
  r.target = 'sadhana-dev';
  assert.equal(validParityReport(r, { now }), false);
});
test('a missing comparison fails closed', () => {
  const r = parity();
  delete r.parity['raaga.teacherMe'];
  assert.equal(validParityReport(r, { now }), false);
});
test('local parity evidence never marks deployed IAM, Cognito or rollback verified', () => {
  const result = readinessChecks({
    ...data,
    parityReport: parity(),
    evidence: DEPLOYED_CHECKS.map((check) => ({ check, result: 'pass', artifact: 'user-claimed' })),
  });
  for (const check of DEPLOYED_CHECKS) assert.equal(result.checks[check], false);
});
test('missing institution or operational records fails readiness', () => {
  const result = readinessChecks({
    seededInstitutions: ['raaga'],
    counts: { classes: 22, sessions: 422, events: 6, venues: 3, people: 7 },
  });
  assert.equal(result.checks.institutionsSeeded, false);
  assert.equal(result.checks.operationalCounts, false);
});
