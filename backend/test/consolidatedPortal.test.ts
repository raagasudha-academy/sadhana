
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const family = readSource('../src/familyAccess.ts');

const controller = readSource(
  '../../src/features/learning/useStudentPortalController.ts'
);

const portalView = readSource(
  '../../src/features/learning/StudentPortalView.tsx'
);

const practice = readSource(
  '../../src/features/learning/StudentPractice.tsx'
);

test('linked student overview permits shared identity only with academy enrolment', () => {
  assert.match(family, /OPS#\$\{inst\}#ENROLMENT/);
  assert.match(family, /membership.Items/);
});

test('student profile is available independently of class enrollment', () => {
  assert.match(
    family,
    /Profile access is independent of class enrolment/
  );
  assert.doesNotMatch(
    family,
    /Student has no active enrolment in this academy/
  );
});

test('family dashboard auto-selects an approved student and renders accessible loading', () => {
  assert.match(controller, /if\s*\(records\.length\)/);

  // Check the extracted view rather than the old StudentHome entrypoint.
  assert.match(portalView, /detailLoading/);
  assert.match(portalView, /role="status"/);
});

test('practice logging is disabled before class enrollment', () => {
  assert.match(
    practice,
    /disabled=\{!detail\.classes\.length\}/
  );
});
