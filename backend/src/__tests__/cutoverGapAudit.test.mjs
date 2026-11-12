import test from 'node:test';
import assert from 'node:assert/strict';
import { auditM9Source } from '../../scripts/cutoverGapAudit.mjs';
test('read-only audit fails closed on unverified migration workflows', () => {
  const result = auditM9Source();
  assert.equal(result.readOnly, true);
  assert.equal(result.fullCutoverReady, false);
  assert.equal(result.statuses.m9LearnerDashboardRouteWired, true);
  assert.equal(result.statuses.m9GuardianAndOnboardingRouteWired, true);
  assert.equal(result.statuses.legacyLearnerWritesStillPresent, true);
  assert.equal(result.statuses.strictLegacyLearnerFenceAvailable, true);
  assert.equal(result.statuses.m9LearnerWriteRoutesWired, true);
  assert.equal(result.statuses.m9HomeworkWriteRoutesWired, true);
  assert.ok(result.blockers.includes('M9_HOMEWORK_MEDIA_NOT_IMPLEMENTED'));
  assert.ok(result.blockers.includes('ROLLBACK_NOT_EXERCISED'));
});
