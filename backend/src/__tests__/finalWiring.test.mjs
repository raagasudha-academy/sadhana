import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';
import { readinessChecks } from '../readinessEvidenceCore.mjs';

const readNormalizedSource = (...args) => normalizeCodeWhitespace(readFileSync(...args));
const lambda = readNormalizedSource(new URL('../lambda.ts', import.meta.url), 'utf8');
const onboarding = readNormalizedSource(
  new URL('../routes/guardianRegistrationRoutes.ts', import.meta.url),
  'utf8',
);
const learner = readNormalizedSource(new URL('../finalLearner.ts', import.meta.url), 'utf8');
const identity = readNormalizedSource(
  new URL('../verifiedCognitoLink.ts', import.meta.url),
  'utf8',
);
const readiness = readNormalizedSource(
  new URL('../../scripts/finalCutoverReadiness.mjs', import.meta.url),
  'utf8',
);
test('learner dashboard is opt-in and runs before old learning routes', () => {
  assert.ok(
    lambda.indexOf('await m9FinalLearnerRoutes(routeContext)') <
      lambda.indexOf('await learningRoutes(routeContext)'),
  );
  assert.match(learner, /M9_FINAL_LEARNER_READS/);
  assert.match(learner, /ConsistentRead:true/);
});
test('learner M9 query never calls legacy routed table', () => {
  assert.doesNotMatch(learner, /makeRoutedClient|SADHANA_TABLE_NAME|OPS#GLOBAL#STUDENT|ACCESS#/);
  assert.match(learner, /GuardianAccessIndex/);
  assert.match(learner, /CognitoIdentityIndex/);
});
test('Cognito identity link cannot approve guardian access or create users', () => {
  assert.match(onboarding, /verified-account/);
  assert.match(identity, /M9_VERIFIED_IDENTITY_LINK_WRITES/);
  assert.match(identity, /email_verified/);
  assert.match(identity, /TransactWriteCommand/);
  assert.doesNotMatch(identity, /AdminCreateUserCommand|accessStatus\s*=/);
});
test('cutover audit cannot execute and has explicit workflow blockers', () => {
  assert.match(readiness, /--execute/);
  assert.match(readiness, /canExecute:false|canExecute: false|readOnly:true/);
  assert.match(readiness, /readinessChecks\(\{seededInstitutions,counts,parityReport\}\)/);
  const { checks } = readinessChecks();
  assert.equal(checks.guardianPortalEndToEnd, false);
  assert.equal(checks.rollbackExercised, false);
});
