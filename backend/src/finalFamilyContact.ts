/** Canonical final-table read for the Family Details contact card. */
import { entityTable } from './entityTables.mjs';
import { demandInstitution, httpError } from './model.ts';
import type { InstitutionId } from './model.ts';
import { json } from './routes/http.ts';
import type { DomainRoute } from './routes/http.ts';
import { defaultM10CoreDirectoryReader } from './coreDirectory.ts';
import type { M10CoreDirectoryReader } from './coreDirectory.ts';

export function makeFinalFamilyContactRoute(
  getReader: () => M10CoreDirectoryReader = defaultM10CoreDirectoryReader,
  env: NodeJS.ProcessEnv = process.env,
): DomainRoute {
  return async ({ parts, method, inst, claims, query }) => {
    if (
      env.SADHANA_ENTITY_TABLE_SET !== 'final' ||
      method !== 'GET' ||
      parts[0] !== 'families' ||
      parts.length !== 3 ||
      parts[2] !== 'contact'
    )
      return undefined;
    const institution = (query.institution ?? inst) as InstitutionId;
    demandInstitution(claims, institution);
    entityTable('families');
    entityTable('people');
    if (env.SADHANA_DATA_MODE === 'split' || env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
      throw httpError(503, 'Final family contact reads are not authorised.');
    const result = await getReader().familyContact(parts[1], institution, claims);
    return json(200, result);
  };
}

export const finalFamilyContactRoute = makeFinalFamilyContactRoute();
