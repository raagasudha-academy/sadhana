
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), 'app', path), 'utf8');

const controller = readSource(
  'src/features/learning/useStudentPortalController.ts'
);

const homework = readSource(
  'src/features/learning/StudentHomework.tsx'
);

const portalView = readSource(
  'src/features/learning/StudentPortalView.tsx'
);

describe('homework completion UX', () => {
 it('respects the reviewed submission lock', () => {
  expect(controller).toContain('reviewedAt?:string|null');
  expect(homework).toContain(
    "submission.reviewedAt?' · Reviewed · Read-only'"
  );
  expect(homework).toContain(
    'disabled={!submissionEditable||submissionBusy}'
  );
 });

 it('retains draft and submit actions', () => {
  expect(homework).toContain("saveAssignment('draft')");
  expect(portalView).toContain("saveAssignment('submitted')");
 });
});
