/** Shared entity-table locator for the existing M9 schema and the prepared canonical copies.
 * Safe default: original M9 tables.  This does NOT convert legacy PK/SK APIs.
 * The final-name path is explicitly locked until after the legacy cutover.
 */
export const ENTITY_NAMES = Object.freeze([
 'institutions','people','families','family-links','classes','venues',
 'enrolments','sessions','attendance','practice','homework','submissions',
 'events','rsvps','registrations','notifications','audit','counters'
]);
const names = new Set(ENTITY_NAMES);
const stages = new Set(['dev','test','staging','prod']);
export function entityTable(entity, options={}) {
 if(!names.has(entity)) throw new Error(`Unknown entity table: ${String(entity)}`);
 const stage = options.stage ?? process.env.SADHANA_ENTITY_STAGE ?? 'dev';
 if(!stages.has(stage)) throw new Error(`Unsupported entity stage: ${String(stage)}`);
 const set = options.set ?? process.env.SADHANA_ENTITY_TABLE_SET ?? 'm9';
 if(set !== 'm9' && set !== 'final') throw new Error('SADHANA_ENTITY_TABLE_SET must be m9 or final');
 if(set === 'final') {
  if(process.env.SADHANA_DATA_MODE === 'split')
   throw new Error('Final entity tables blocked: legacy split PK/SK routing is still active');
  if(process.env.SADHANA_ENTITY_FINAL_ACK !== 'enabled')
   throw new Error('Final entity tables blocked: explicit cutover approval is missing');
 }
 const suffix = set === 'final' ? (entity === 'audit' ? 'audit-records' : entity) : `m9-${entity}`;
 return `sadhana-${stage}-${suffix}`;
}
