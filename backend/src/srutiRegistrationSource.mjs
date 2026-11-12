/** Sruti's private web-intake source is isolated from Sadhana's imported records.
 * Prod intentionally keeps the public table name `sruti-student-registrations`;
 * non-prod stages are explicitly prefixed to prevent accidental cross-stage reads.
 */
const stages = new Set(['dev', 'staging', 'prod']);

export function srutiSourceTable(env = process.env) {
  const stage = env.SADHANA_ENTITY_STAGE ?? 'dev';
  if (!stages.has(stage)) throw new Error('Unsupported Sruti source stage');
  const expected =
    stage === 'prod' ? 'sruti-student-registrations' : `sruti-${stage}-student-registrations`;
  const configured = env.SRUTI_SOURCE_REGISTRATIONS_TABLE;
  if (configured && configured !== expected)
    throw new Error('Sruti source table does not match stage');
  return expected;
}
