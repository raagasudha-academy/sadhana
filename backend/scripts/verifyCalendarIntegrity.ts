/**
 * Sadhana calendar integrity audit (read-only against DynamoDB).
 * Run from backend/: npx tsx scripts/verifyCalendarIntegrity.ts --table sadhana-dev-main
 * Optional: --baseline ../calendar-integrity-baseline.json (creates local file only, never overwrites)
 * Optional: --compare ../calendar-integrity-baseline.json (checks record count/key integrity, not exact contents)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { VENUES } from '../src/academyVenues.ts';
import { schedulePK } from '../src/scheduleModel.ts';
import type { ScheduleInstitution } from '../src/scheduleModel.ts';
import { seriesPK } from '../src/scheduleSeries.ts';

const args = process.argv.slice(2);
const flag = (key: string) => { const i = args.indexOf(key); return i < 0 ? '' : args[i + 1] || ''; };
const table = flag('--table') || process.env.SADHANA_TABLE_NAME;
const baseline = flag('--baseline');
const compare = flag('--compare');
if (!table || !/^[a-zA-Z0-9_.-]{3,255}$/.test(table)) throw Error('Pass --table sadhana-dev-main');
if (baseline && compare) throw Error('Use --baseline or --compare, not both');
if ((args.includes('--baseline') && !baseline) || (args.includes('--compare') && !compare)) throw Error('Missing baseline/compare filename');

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
type Item = Record<string, any>;
async function queryAll(pk: string): Promise<Item[]> {
  const out: Item[] = [];
  let next: Record<string, any> | undefined;
  do {
    const result = await db.send(new QueryCommand({
      TableName: table, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: next, ConsistentRead: true
    }));
    out.push(...(result.Items || []));
    next = result.LastEvaluatedKey;
  } while (next);
  return out;
}
const institutions: ScheduleInstitution[] = ['raaga', 'sruti', 'shared'];
const partitions = await Promise.all(institutions.map(i => queryAll(schedulePK(i))));
const all = partitions.flat();
const counts = Object.fromEntries(['class', 'class-session', 'holiday', 'special-event'].map(
  type => [type, all.filter(x => x.recordType === type).length]));
const unexpectedTypes = [...new Set(all.map(x => x.recordType).filter(x => !Object.keys(counts).includes(x)))];
const masters = all.filter(x => x.recordType === 'class');
const sessions = all.filter(x => x.recordType === 'class-session');
const mastersByIdentity = new Map(masters.map(x => [`${x.institution}#${x.id}`, x]));
const orphanSessions = sessions.filter(x => !mastersByIdentity.has(`${x.institution}#${x.classId}`));
const duplicateKeys = all.map(x => `${x.PK}|${x.SK}`).filter((k, i, keys) => keys.indexOf(k) !== i);
const venues = [];
for (const venue of VENUES) {
  const row = await db.send(new GetCommand({TableName: table, Key: {PK: `VENUE#${venue.id}`, SK: 'META'}, ConsistentRead: true}));
  const targetMasters = masters.filter(x => venue.masterIds.includes(x.id));
  const targetSessions = sessions.filter(x => venue.masterIds.includes(x.classId));
  const unmatched = [...targetMasters, ...targetSessions].filter(x => x.venueId !== venue.id);
  venues.push({id: venue.id, exists: !!row.Item, name: row.Item?.name ?? null,
    masterCount: targetMasters.length, sessionCount: targetSessions.length,
    unlinkedCount: unmatched.length, unlinkedExampleIds: unmatched.slice(0, 5).map(x => x.id)});
}
const venueIds = new Set(venues.filter(v => v.exists).map(v => v.id));
const unknownVenueLinks = [...masters, ...sessions].filter(x => x.venueId && !venueIds.has(x.venueId))
  .map(x => ({institution: x.institution, id: x.id, venueId: x.venueId}));

// An explicit audit of *stored* Vedanta teacher assignments and dated rules.
// This does not replace an independent test of read-time session projections/overrides.
const srutiRules = await queryAll(seriesPK('sruti'));
const raagaRules = await queryAll(seriesPK('raaga'));
const rules = [...srutiRules, ...raagaRules].filter(x => x.entityType === 'scheduleSeriesRule');
const vedantaMasters = masters.filter(x => /vedanta/i.test(`${x.name || ''} ${x.programme || ''}`));
const vedantaKeys = new Set(vedantaMasters.map(x => `${x.institution}#${x.id}`));
const vedantaSessions = sessions.filter(x => vedantaKeys.has(`${x.institution}#${x.classId}`));
const vedantaRules = rules.filter(x => vedantaKeys.has(`${x.institution}#${x.classId}`));
const targetName = 'Mr Srikailash Venkitadri';
const targetId = 'TEACHER-8a013a2f-2b03-471b-b74e-3619e6a4bfd1';
const mismatch = (x: Item) => x.teacher !== targetName || x.teacherId !== targetId;
const masterMismatches = vedantaMasters.filter(mismatch).map(x => ({institution: x.institution, id: x.id, teacher: x.teacher ?? null, teacherId: x.teacherId ?? null}));
const sessionMismatches = vedantaSessions.filter(mismatch).map(x => ({institution: x.institution, id: x.id, date: x.date, teacher: x.teacher ?? null, teacherId: x.teacherId ?? null}));
const ruleMismatches = vedantaRules.filter(x => ('teacher' in (x.changes || {}) || 'teacherId' in (x.changes || {})) &&
  (x.changes?.teacher !== targetName || x.changes?.teacherId !== targetId))
  .map(x => ({institution: x.institution, classId: x.classId, effectiveFrom: x.effectiveFrom, changes: x.changes}));

const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const snapshot = all.map(x => ({PK: x.PK, SK: x.SK, hash: hash(x)}))
  .sort((a,b) => `${a.PK}/${a.SK}`.localeCompare(`${b.PK}/${b.SK}`));
const keysFingerprint = hash(snapshot.map(({PK, SK}) => ({PK, SK})));
const scheduleFingerprint = hash(snapshot);
const structuralOK = duplicateKeys.length === 0 && orphanSessions.length === 0 && unexpectedTypes.length === 0;
const targetedVenueLinksOK = venues.every(v => v.exists && v.unlinkedCount === 0);
const knownVenueLinksOK = unknownVenueLinks.length === 0;
const vedantaStoredAssignmentsOK = masterMismatches.length === 0 && sessionMismatches.length === 0 && ruleMismatches.length === 0;
const result = {
  mode: 'READ_ONLY', table,
  historicalImportCount: 294, historicalImportCountIsNotCurrentExpectation: true,
  calendarCount: all.length, counts, structuralOK,
  orphanSessionCount: orphanSessions.length, orphanSessionExamples: orphanSessions.slice(0, 10).map(x => x.id),
  duplicateKeyCount: duplicateKeys.length, unexpectedTypes,
  venues, targetedVenueLinksOK, knownVenueLinksOK, unknownVenueLinks: unknownVenueLinks.slice(0, 10),
  vedanta: {masterCount: vedantaMasters.length, datedSessionCount: vedantaSessions.length, seriesRuleCount: vedantaRules.length,
    targetName, targetId, storedAssignmentsOK: vedantaStoredAssignmentsOK,
    masterMismatches, sessionMismatches: sessionMismatches.slice(0, 40), sessionMismatchCount: sessionMismatches.length, ruleMismatches},
  keysFingerprint, scheduleFingerprint
};
console.log(JSON.stringify(result, null, 2));
if (baseline) {
  if (!structuralOK || !targetedVenueLinksOK || !knownVenueLinksOK || !vedantaStoredAssignmentsOK)
    throw Error('Audit failed: refusing to save passing baseline.');
  writeFileSync(baseline, JSON.stringify({table, calendarCount: all.length, counts, keysFingerprint, scheduleFingerprint}, null, 2) + '\n',
    {flag: 'wx', mode: 0o600});
  console.log('Baseline written locally:', baseline);
}
if (compare) {
  const before = JSON.parse(readFileSync(compare, 'utf8'));
  const comparison = {sameTable: before.table === table,
    recordCountUnchanged: before.calendarCount === all.length,
    recordKeysUnchanged: before.keysFingerprint === keysFingerprint,
    recordContentsUnchanged: before.scheduleFingerprint === scheduleFingerprint};
  console.log(JSON.stringify({comparison}, null, 2));
  if (!comparison.sameTable || !comparison.recordCountUnchanged || !comparison.recordKeysUnchanged) process.exitCode = 2;
}
if (!structuralOK || !targetedVenueLinksOK || !knownVenueLinksOK || !vedantaStoredAssignmentsOK) process.exitCode = 2;
