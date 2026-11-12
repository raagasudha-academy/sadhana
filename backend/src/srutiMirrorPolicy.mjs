/** Pure, fail-closed table selection for stage-isolated Sruti public intake. */
import { srutiSourceTable } from './srutiRegistrationSource.mjs';
export function srutiWriterTables(env = process.env) {
  return { primary: srutiSourceTable(env) };
}
