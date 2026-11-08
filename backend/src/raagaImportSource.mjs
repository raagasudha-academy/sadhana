/** Normalise only the independently known Raagasudha website institution alias.
 * Never accept arbitrary institution labels or override the site approval.
 */
export function canonicalRaagaRegistration(record){
 if(!record||typeof record!=='object'||Array.isArray(record))return record;
 return record.institution==='RAAGASUDHA'?{...record,institution:'raaga'}:record;
}
