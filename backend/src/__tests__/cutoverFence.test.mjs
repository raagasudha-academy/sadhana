import test from 'node:test';
import assert from 'node:assert/strict';
import { m9CutoverFence, M9_LEGACY_DATA_ROOTS } from '../cutoverFence.mjs';
const strict = { strict: true, learnerReads: true, onboarding: true, m9Routes: true };
test('fence is opt-in and leaves existing production routes unchanged', () => {
  for (const root of M9_LEGACY_DATA_ROOTS)
    assert.equal(m9CutoverFence([root], 'GET', { strict: false }), null);
});
test('strict M9 cannot silently read legacy learner/registration and practice tables', () => {
  for (const root of M9_LEGACY_DATA_ROOTS) {
    assert.equal(m9CutoverFence([root], 'GET', strict)?.status, 503, root);
    assert.equal(m9CutoverFence([root], 'POST', strict)?.status, 503, root);
    assert.equal(m9CutoverFence([root], 'PATCH', strict)?.status, 503, root);
  }
});
test('only independently implemented M9 dashboard is allowed', () => {
  assert.equal(m9CutoverFence(['learner', 'stu1', 'dashboard'], 'GET', strict), null);
  assert.equal(m9CutoverFence(['learner', 'stu1', 'dashboard'], 'POST', strict)?.status, 503);
  assert.equal(
    m9CutoverFence(['learner', 'stu1', 'dashboard'], 'GET', { ...strict, learnerReads: false })
      ?.status,
    503,
  );
  assert.equal(m9CutoverFence(['learner', 'stu1', 'practice'], 'POST', strict)?.status, 503);
});
test('onboarding and experimental M9 routes retain their own feature flags', () => {
  assert.equal(m9CutoverFence(['m9-onboarding', 'status'], 'GET', strict), null);
  assert.equal(
    m9CutoverFence(['m9-onboarding', 'status'], 'GET', { ...strict, onboarding: false })?.status,
    503,
  );
  assert.equal(m9CutoverFence(['m9', 'record', 'classes'], 'POST', strict), null);
  assert.equal(
    m9CutoverFence(['m9', 'record', 'classes'], 'POST', { ...strict, m9Routes: false })?.status,
    503,
  );
});
test('existing timetable and health routes are unaffected by the learner-domain fence', () => {
  assert.equal(m9CutoverFence(['schedule'], 'GET', strict), null);
  assert.equal(m9CutoverFence(['health'], 'GET', strict), null);
});

test('M9 strict fence permits only opted-in learner practice and RSVP writes', () => {
  const enabled = { strict: true, learnerWrites: true };
  assert.equal(m9CutoverFence(['learner', 'STUDENT-1', 'practice'], 'POST', enabled), null);
  assert.equal(
    m9CutoverFence(['learner', 'STUDENT-1', 'practice', 'PRACTICE-1'], 'PATCH', enabled),
    null,
  );
  assert.equal(m9CutoverFence(['learner', 'STUDENT-1', 'rsvp'], 'PUT', enabled), null);
  assert.equal(m9CutoverFence(['learner', 'STUDENT-1', 'homework'], 'POST', enabled).status, 503);
  assert.equal(
    m9CutoverFence(['learner', 'STUDENT-1', 'practice'], 'POST', { strict: true }).status,
    503,
  );
});
test('teacher practice recordings remain behind assigned teacher feature gate', () => {
  assert.equal(
    m9CutoverFence(['teacher-practice', 'PRACTICE-1', 'media'], 'GET', {
      strict: true,
      teacherPractice: true,
    }),
    null,
  );
  assert.equal(
    m9CutoverFence(['teacher-practice', 'PRACTICE-1', 'media'], 'GET', {
      strict: true,
      teacherPractice: false,
    }).status,
    503,
  );
  assert.equal(
    m9CutoverFence(['teacher-practice', 'PRACTICE-1', 'media'], 'POST', {
      strict: true,
      teacherPractice: true,
    }).status,
    503,
  );
});
