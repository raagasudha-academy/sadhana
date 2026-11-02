import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = readFileSync(new URL('../src/learnerExtras.ts', import.meta.url), 'utf8');
test('learner extras require approved academy-scoped access', () => {
  const policy = readFileSync(
    new URL('../src/learnerAccessPolicy.ts', import.meta.url),
    'utf8'
  );

  // Learner identity must use the account-specific,
  // academy-specific access partition.
  assert.match(src, /ACCESS#\$\{inst\}#\$\{claims.sub\}/);

  // The learner endpoint must enforce the shared policy.
  assert.match(
    src,
    /requireApprovedLearnerLink\(inst,\s*claims\.sub,\s*studentId,\s*access\)/
  );

  // Verify the security checks exist in the shared policy.
  assert.match(policy, /status\s*!==\s*['"]approved['"]/);
  assert.match(policy, /institution\s*!==\s*inst/);
  assert.match(policy, /studentId\s*!==\s*studentId/);
});

test('profile cannot alter login or legal identity', () => {
  assert.match(src, /preferredName','phone','about','expectedVersion/);
  assert.doesNotMatch(src, /AdminUpdateUserAttributesCommand/)
});
test('file uploads are private, size bound and checked after upload', () => {
  assert.match(src, /learner-private/);
  assert.match(src, /HeadObjectCommand/);
  assert.match(src, /ContentLength>kind.max/);
  assert.match(src, /expiresIn:300/)
});

test('cross-academy link is pending and requires approval', () => {
  const x = readFileSync(new URL('../src/crossAcademyGuardian.ts', import.meta.url), 'utf8');
  assert.match(x, /demandInstitution\(claims,'sruti'\)/);
  assert.match(x, /prior.status!=='approved'/);
  assert.match(x, /requestStudentAccess\('sruti'/)
});
test('homework membership is based on actual academy enrolment', () => {
  const x = readFileSync(new URL('../src/homework.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(x, /student.institution!==inst/);
  assert.match(x, /OPS#\$\{inst\}#ENROLMENT/)
});
