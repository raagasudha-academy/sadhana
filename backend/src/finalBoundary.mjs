/**
 * Guardrail for the canonical entity-table experiment.
 *
 * This is not a route migration and does not approve a production cutover.
 * M9/M10 canonical handlers must get first refusal; any remaining legacy
 * PK/SK route must fail closed rather than silently hit sadhana-dev-main or
 * the old domain tables.  Default production behaviour is unchanged.
 */
export function finalOnlyGate(parts, method, phase = 'fallback', env = process.env) {
  if (env.SADHANA_ENTITY_TABLE_SET !== 'final') return null;
  if (!Array.isArray(parts) || typeof method !== 'string')
    return {status: 503, error: 'Final-table cutover: unrecognised request.'};
  if (phase === 'early') {
    // These routes currently depend on PK/SK identity/profile tables or on
    // legacy subject lookup. A dedicated final-schema adapter is required.
    if (['me', 'photos', 'identities'].includes(parts[0]))
      return {status: 503, error: 'Final-table cutover: identity/profile route not migrated.'};
    return null;
  }
  if (phase !== 'fallback') throw new Error('Unknown final-table gate phase');
  if (parts.length === 1 && parts[0] === 'health' && method === 'GET') return null;
  return {
    status: 503,
    error: 'Final-table cutover: this endpoint is not migrated; legacy database fallback blocked.'
  };
}
