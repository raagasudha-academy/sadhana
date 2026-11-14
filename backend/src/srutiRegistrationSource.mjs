/** Sruti's private web-intake source is isolated from Sadhana's imported records.
 * Source tables are explicitly stage-prefixed to prevent cross-stage reads.
 */
const stages = new Set(['dev', 'staging', 'prod']);
const registrationTables = Object.freeze({
  dev: 'dev-sruti-student-registrations',
  staging: 'staging-sruti-student-registrations',
  prod: 'prod-sruti-student-registrations',
});

export function srutiSourceTable(env = process.env) {
  const stage = env.SADHANA_ENTITY_STAGE ?? 'dev';
  if (!stages.has(stage)) throw new Error('Unsupported Sruti source stage');
  const expected = `${stage}-sruti-student-registrations`;
  const configured = env.SRUTI_SOURCE_REGISTRATIONS_TABLE;
  if (configured && configured !== expected)
    throw new Error('Sruti source table does not match stage');
  return expected;
}

/**
 * Admin review and import read the stage's Sruti intake source. Imported Sadhana
 * records are written separately through entityTable('registrations').
 */
export function srutiRegistrationTable(env = process.env) {
  const stage = env.SADHANA_ENTITY_STAGE ?? 'dev';
  if (!stages.has(stage)) throw new Error('Unsupported Sruti source stage');
  const expected = registrationTables[stage];
  const configured = env.SRUTI_REGISTRATIONS_TABLE;
  if (configured !== undefined && configured !== expected)
    throw new Error('Sruti registration table does not match stage');
  return expected;
}
