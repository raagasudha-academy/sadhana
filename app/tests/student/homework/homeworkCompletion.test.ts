import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compactSource } from '../../sourceText';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), 'app', path), 'utf8');

const controller = compactSource(readSource('src/features/learning/useStudentPortalController.ts'));

const homeworkSource = readSource('src/features/learning/StudentHomework.tsx');
const homework = compactSource(homeworkSource);

const portalView = compactSource(readSource('src/features/learning/StudentPortalView.tsx'));

describe('homework completion UX', () => {
  it('respects the reviewed submission lock', () => {
    expect(controller).toContain(compactSource('reviewedAt?: string | null'));
    expect(homeworkSource).toContain('submission.reviewedAt');
    expect(homeworkSource).toContain('· Reviewed · Read-only');
    expect(homework).toContain(compactSource('disabled={!submissionEditable || submissionBusy}'));
  });

  it('retains draft and submit actions', () => {
    expect(homework).toContain(compactSource("saveAssignment('draft')"));
    expect(portalView).toContain(compactSource("saveAssignment('submitted')"));
  });
});
