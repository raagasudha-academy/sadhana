/** Shared, fail-closed learner access checks. No name/email/family inference. */
import { httpError } from './model.ts';
import type { InstitutionId } from './model.ts';
import { isStudentRecordId, isAccountSubject } from './accessRules.ts';

export function requireApprovedLearnerLink(
  inst: InstitutionId,
  sub: unknown,
  studentId: unknown,
  link: unknown,
): void {
  if (!isAccountSubject(sub) || !isStudentRecordId(studentId))
    throw httpError(403, 'Student access denied');
  const record = link && typeof link === 'object' ? (link as Record<string, unknown>) : null;
  if (
    !record ||
    record.status !== 'approved' ||
    record.institution !== inst ||
    record.studentId !== studentId ||
    (record.subject !== undefined && record.subject !== sub)
  )
    throw httpError(403, 'Approval required for this academy');
}

export function requireActiveLearner(student: unknown): asserts student is Record<string, unknown> {
  const record =
    student && typeof student === 'object' ? (student as Record<string, unknown>) : null;
  if (!record || record.archived === true) throw httpError(404, 'Active student record not found');
}
