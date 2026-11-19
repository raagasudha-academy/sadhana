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

  it('uses a submit-only flow and confirms discarding unsent edits on close', () => {
    expect(homework).not.toContain('Save draft');
    expect(homework).toContain(compactSource('Submit homework'));
    expect(portalView).toContain(compactSource('saveAssignment()'));
    expect(controller).toContain(compactSource('Close without submitting?'));
    expect(controller).toContain(compactSource("status: 'submitted'"));
  });

  it('uploads recorded audio as an attachment for submission', () => {
    expect(homework).toContain(compactSource('<AudioFeedbackRecorder'));
    expect(homework).toContain(
      compactSource('onRecording={(file) => void uploadHomeworkFiles([file])}'),
    );
    expect(controller).toContain(compactSource('beginHomeworkEvidence('));
    expect(controller).toContain(compactSource('finishHomeworkEvidence('));
    expect(controller).toContain(compactSource('attachmentIds: ids'));
    expect(controller).toContain(compactSource('attachmentIds: submission.attachmentIds'));
  });
});
