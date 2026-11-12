/** Pure, fail-closed table selection for Sruti public intake.
 * The mirror is an atomic transition aid; primary remains M9 until cutover.
 */
const LEGACY = 'sadhana-dev-m9-registrations';
const FINAL = 'sadhana-dev-registrations';
export function srutiWriterTables(env = process.env) {
  const primary = env.M91_SRUTI_REGISTRATIONS_TABLE || LEGACY;
  const mirror = env.M91_SRUTI_REGISTRATIONS_MIRROR_TABLE || undefined;
  if (primary !== LEGACY && primary !== FINAL)
    throw new Error('Unapproved Sruti registration table');
  if (mirror !== undefined && (primary !== LEGACY || mirror !== FINAL))
    throw new Error('Sruti mirror requires M9 primary and the exact final destination');
  if (primary === FINAL && env.M91_SRUTI_FINAL_WRITER_ACK !== 'enabled')
    throw new Error('Final Sruti writer requires explicit cutover acknowledgement');
  return { primary, mirror };
}
