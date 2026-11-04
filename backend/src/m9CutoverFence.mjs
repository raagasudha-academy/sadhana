/**
 * Fail-closed M9 data-domain fence. This NEVER enables a route or permission.
 * Use only in an isolated M9 test Lambda until every blocked workflow has a
 * genuine M9 implementation. Keeping it independent of the legacy router
 * prevents accidental PK/SK reads or writes when testing an M9 cutover.
 */
const LEGACY_DATA_ROOTS = new Set([
  'learner', 'homework', 'teacher-practice', 'family-access',
  'students', 'enrolments', 'attendance', 'practice', 'submissions',
  'families', 'guardians', 'parents', 'registrations',
  'website-registrations', 'notifications', 'audit',
]);
export function m9CutoverFence(parts, method, options = {}) {
  const strict = options.strict ?? (process.env.M9_STRICT_DATA_FENCE === 'enabled');
  if (!strict) return null;
  if (!Array.isArray(parts) || typeof method !== 'string') return {status:503, error:'M9 strict fence: unrecognised request.'};
  const root = parts[0];
  // The only learner route proven to read M9 with independently verified
  // Cognito/guardian access. Its handler retains a separate opt-in flag.
  if (root === 'learner' && parts.length === 3 && parts[2] === 'dashboard'
      && method === 'GET' && options.learnerReads === true) return null;
  if (root === 'learner' && options.learnerWrites === true && (
      (parts.length === 3 && parts[2] === 'practice' && method === 'POST') ||
      (parts.length === 4 && parts[2] === 'practice' && method === 'PATCH') ||
      (parts.length === 3 && parts[2] === 'rsvp' && method === 'PUT')
  )) return null;
  if (options.homeworkWrites === true && (
      (root === 'homework' && ((parts.length === 2 && ['GET','POST'].includes(method)) || (parts.length === 3 && method === 'PUT') || (parts.length === 5 && parts[2] === 'evidence' && method === 'GET' && options.media === true) || (parts.length === 4 && parts[2] === 'submissions' && method === 'GET') || (parts.length === 5 && parts[2] === 'feedback' && method === 'POST'))) ||
      (root === 'learner' && ((parts.length === 3 && parts[2] === 'homework' && ['GET','POST'].includes(method)) || (parts.length === 4 && parts[2] === 'submission' && ['GET','PUT'].includes(method)) || (parts.length === 5 && parts[2] === 'submission' && parts[4] === 'evidence' && method === 'GET' && options.media === true) || (parts.length === 6 && parts[2] === 'submission' && parts[4] === 'evidence' && ['start','finish'].includes(parts[5]) && method === 'POST' && options.media === true) ))
  )) return null;
  // M9 onboarding is deliberately handled by its own explicit feature gate,
  // and does not fall through into the old onboarding handlers.
  if (root === 'm9-onboarding' && options.onboarding === true) return null;
  if (root === 'm9' && options.m9Routes === true) return null;
  if (root === 'm9' || root === 'm9-onboarding') return {status:503,error:'M9 strict fence: M9 integration is disabled.'};
  if (LEGACY_DATA_ROOTS.has(root)) return {
    status:503,
    error:'M9 strict fence: this workflow has not been migrated and must not use legacy tables.'
  };
  return null;
}
export const M9_LEGACY_DATA_ROOTS=Object.freeze([...LEGACY_DATA_ROOTS]);
