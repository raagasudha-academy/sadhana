/** Strict no-legacy-fallback guard for remaining learning endpoints.
 * M9 homework and learner routes MUST execute before this guard.
 * This adapter intentionally does not pretend unsupported legacy extras are migrated.
 */
import type { DomainRoute } from './http.ts';
import { json } from './http.ts';
import { httpError, demandInstitution } from '../model.ts';

export const m10LearningCutoverRoutes: DomainRoute = async ({ parts, method, inst, claims }) => {
  if (process.env.M10_LEARNING_NO_LEGACY !== 'enabled') return undefined;
  const root = parts[0];
  const learning =
    root === 'homework' ||
    root === 'teacher-practice' ||
    (root === 'learner' && parts.length >= 3) ||
    root === 'practice';
  if (!learning) return undefined;
  if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Select a valid institution.');
  // The corresponding M9 handlers have first refusal. Their authorization is
  // specific to the student, teacher or family; this guard never grants access.
  // Every remaining path must fail closed instead of reaching learningRoutes or
  // the legacy resource repository.
  if (root === 'teacher-practice' || root === 'practice') demandInstitution(claims, inst);
  return json(503, {
    error: 'This learning operation has not been migrated to M9. No legacy database fallback.',
  });
};
