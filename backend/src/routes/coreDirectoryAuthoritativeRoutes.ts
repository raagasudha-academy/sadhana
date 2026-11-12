/** Opt-in authoritative M9 reads for existing /students, /families, /enrolments APIs.
 * Never silently falls back to legacy PK/SK storage when enabled.
 * Identity-changing writes deliberately remain blocked until the M9 write service
 * can enforce relationship, uniqueness, and audit invariants atomically.
 */
import type { DomainRoute } from './http.ts';
import { json } from './http.ts';
import { demandInstitution, httpError } from '../model.ts';
import { defaultM10CoreDirectoryReader } from '../coreDirectory.ts';
import type { M10CoreDirectoryReader, M10CoreEntity } from '../coreDirectory.ts';

let cached: M10CoreDirectoryReader | undefined;
const live = () => (cached ??= defaultM10CoreDirectoryReader());
const roots = new Set(['students', 'families', 'enrolments']);

export function makeM10CoreDirectoryAuthoritativeRoutes(
  getReader: () => M10CoreDirectoryReader = live,
): DomainRoute {
  return async ({ parts, method, inst, claims }) => {
    if (process.env.M10_CORE_DIRECTORY_ROUTING !== 'enabled' || !roots.has(parts[0]))
      return undefined;
    if (inst !== 'raaga' && inst !== 'sruti') throw httpError(400, 'Select a valid institution.');
    demandInstitution(claims, inst);
    if (process.env.M9_TARGET_REPOSITORY_ENABLED !== 'read-only')
      return json(503, { error: 'M9 core directory is disabled.' });
    if (
      method === 'GET' &&
      parts[0] === 'students' &&
      parts.length === 3 &&
      parts[2] === 'details'
    ) {
      return json(200, await getReader().studentDetails(parts[1], inst, claims));
    }
    if (method === 'GET' && parts.length === 1) {
      const page = await getReader().list(parts[0] as M10CoreEntity, inst, claims);
      // Projection throws on incomplete/duplicate identity or missing contact. Do not catch:
      // the Lambda's central handler suppresses internal details as a 500.
      return json(200, page);
    }
    if (
      method === 'GET' &&
      parts[0] === 'families' &&
      parts.length === 3 &&
      parts[2] === 'contact'
    ) {
      const contact = await getReader().familyContact(parts[1], inst, claims);
      return json(200, contact);
    }
    // Explicitly avoid a legacy write fallback for an authoritative M9 route.
    return json(503, { error: 'M9 core directory writes are not yet migrated.' });
  };
}
export const m10CoreDirectoryAuthoritativeRoutes = makeM10CoreDirectoryAuthoritativeRoutes();
