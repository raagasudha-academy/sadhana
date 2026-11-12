/** Explicit shadow-only directory parity. Never serves M9 PII to the frontend. */
import type { DomainRoute } from './http.ts';
import { json } from './http.ts';
import { demandInstitution, httpError } from '../model.ts';
import type { InstitutionId, Claims } from '../model.ts';
import { sameDirectoryRows } from '../directoryCompatibility.ts';
import { defaultM10CoreDirectoryReader } from '../coreDirectory.ts';
import type { M10CoreDirectoryReader, M10CoreEntity } from '../coreDirectory.ts';
export type M10LegacyDirectory = (
  entity: M10CoreEntity,
  inst: InstitutionId,
  claims: Claims,
) => Promise<{ records: Record<string, any>[]; more: boolean }>;
let instance: M10CoreDirectoryReader | undefined;
const live = () => (instance ??= defaultM10CoreDirectoryReader());
export function makeM10CoreDirectoryRoutes(
  getReader: () => M10CoreDirectoryReader = live,
  getLegacy?: M10LegacyDirectory,
): DomainRoute {
  return async ({ method, parts, query, inst, claims }) => {
    if (
      process.env.M10_CORE_DIRECTORY_SHADOW !== 'enabled' ||
      method !== 'GET' ||
      parts.length !== 1 ||
      !['students', 'families', 'enrolments'].includes(parts[0])
    )
      return undefined;
    const institution = query.institution ?? inst;
    if (institution !== 'raaga' && institution !== 'sruti')
      throw httpError(400, 'Choose a valid institution.');
    demandInstitution(claims, institution);
    if (!getLegacy) throw Error('M10_LEGACY_DIRECTORY_LOOKUP_MISSING');
    const entity = parts[0] as M10CoreEntity;
    const old = await getLegacy(entity, institution, claims);
    try {
      const next = await getReader().list(entity, institution, claims);
      console.info('M10 core directory shadow', {
        entity,
        institution,
        same: sameDirectoryRows(old.records, next.records),
        legacyCount: old.records.length,
        m9Count: next.records.length,
      });
    } catch (e) {
      console.warn('M10 core directory shadow unavailable', {
        entity,
        institution,
        errorName: (e as Error)?.message?.startsWith('M10_')
          ? (e as Error).message
          : (e as Error)?.name,
      });
    }
    return json(200, old);
  };
}
