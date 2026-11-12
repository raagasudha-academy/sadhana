import test from 'node:test';
import assert from 'node:assert/strict';
import { planMigration } from '../../scripts/migrationPlannerCore.mjs';
const row = (pk, id, recordType, additional = {}) => ({
  PK: pk,
  SK: `RECORD#${id}`,
  id,
  recordType,
  institution: pk.slice('SCHEDULE#'.length),
  ...additional,
});
const fixture = () => ({
  calendar: [
    row('SCHEDULE#raaga', 'CLASS-1', 'class'),
    row('SCHEDULE#raaga', 'SESSION-1', 'class-session', { classId: 'CLASS-1', date: '2026-11-09' }),
    row('SCHEDULE#shared', 'HOLIDAY-1', 'holiday', { date: '2026-12-25' }),
    row('SCHEDULE#raaga', 'EVT-1', 'special-event', { managedEvent: true }),
    { PK: 'VENUE#V1', SK: 'DETAIL', id: 'V1' },
    {
      PK: 'SCHEDULE_SERIES#raaga',
      SK: 'CLASS#CLASS-1#FROM#2026-11-09',
      institution: 'raaga',
      classId: 'CLASS-1',
      effectiveFrom: '2026-11-09',
      changes: { startTime: '12:00' },
    },
  ],
  admin: [
    {
      PK: 'TEACHER_REGISTRY',
      SK: 'TEACHER#T1',
      id: 'T1',
      cognitoSub: 'SUB-1',
      institutions: ['raaga'],
    },
    { PK: 'TEACHER_SUB#SUB-1', SK: 'LINK', teacherId: 'T1' },
  ],
  audit: [{ PK: 'AUDIT#raaga', SK: 'EVENT#1', at: '2026-01-01' }],
  students: [],
  learning: [],
});
test('maps records, merges subject link, preserves series rules and audits', () => {
  const p = planMigration(fixture(), { strictBaseline: false });
  assert.equal(p.summary.blockerCount, 0);
  assert.equal(p.summary.sourceTotal, 9);
  assert.equal(p.summary.targetItemsEstimated, 8);
  assert.equal(p.summary.readyForMappingReview, true);
  assert.equal(p.summary.destinationCounts['sadhana-dev-sessions'], 3);
  assert.equal(p.mappings.find((m) => m.recordType === 'series-change').ruleChangesPreserved, true);
});
test('flags orphan class session', () => {
  const f = fixture();
  f.calendar[1].classId = 'MISSING';
  const p = planMigration(f, { strictBaseline: false });
  assert.ok(p.problems.some((x) => x.code === 'ORPHAN_CLASS_SESSION'));
});
test('flags teacher subject mismatch', () => {
  const f = fixture();
  f.admin[1].PK = 'TEACHER_SUB#OTHER';
  const p = planMigration(f, { strictBaseline: false });
  assert.ok(p.problems.some((x) => x.code === 'TEACHER_SUB_MISMATCH'));
});
test('flags duplicate target identifier rather than overwriting', () => {
  const f = fixture();
  f.calendar.push(row('SCHEDULE#sruti', 'CLASS-1', 'class'));
  const p = planMigration(f, { strictBaseline: false });
  assert.ok(p.problems.some((x) => x.code === 'DUPLICATE_TARGET_KEY'));
});
test('baseline drift stops review readiness', () => {
  const p = planMigration(fixture());
  assert.equal(p.summary.readyForMappingReview, false);
  assert.ok(p.problems.some((x) => x.code === 'BASELINE_DRIFT'));
});
test('flags previously cleaned tables if no longer empty', () => {
  const f = fixture();
  f.students.push({ PK: 'X', SK: 'Y' });
  const p = planMigration(f, { strictBaseline: false });
  assert.ok(p.problems.some((x) => x.code === 'NONEMPTY_CLEAN_SLATE'));
});

test('historical audit IDs reused within and across institutions produce unique stable target keys', () => {
  const f = fixture();
  f.audit = [
    { PK: 'AUDIT#raaga', SK: 'EVENT#1', id: 'DUPLICATE', at: '2026-01-01' },
    { PK: 'AUDIT#raaga', SK: 'EVENT#2', id: 'DUPLICATE', at: '2026-01-02' },
    { PK: 'AUDIT#sruti', SK: 'EVENT#3', id: 'DUPLICATE', at: '2026-01-03' },
    { PK: 'AUDIT#shared', SK: 'EVENT#4', at: '2026-01-04' },
  ];
  const p = planMigration(f, { strictBaseline: false });
  assert.equal(p.summary.blockerCount, 0);
  assert.equal(p.summary.destinationCounts['sadhana-dev-audit'], 4);
  assert.equal(p.summary.readyForMappingReview, true);
  const mapped = p.mappings.filter((x) => x.recordType === 'legacy-audit');
  assert.equal(new Set(mapped.map((x) => x.destinationKey.auditId)).size, 4);
  assert.deepEqual(
    mapped.map((x) => x.legacyAuditId),
    ['DUPLICATE', 'DUPLICATE', 'DUPLICATE', null],
  );
  assert.deepEqual(
    mapped.map((x) => x.destinationKey.auditId),
    planMigration(f, { strictBaseline: false })
      .mappings.filter((x) => x.recordType === 'legacy-audit')
      .map((x) => x.destinationKey.auditId),
  );
});

test('identical source audit keys still produce a blocking collision', () => {
  const f = fixture();
  f.audit = [
    { PK: 'AUDIT#raaga', SK: 'EVENT#1', id: 'A' },
    { PK: 'AUDIT#raaga', SK: 'EVENT#1', id: 'B' },
  ];
  const p = planMigration(f, { strictBaseline: false });
  assert.ok(p.problems.some((x) => x.code === 'DUPLICATE_TARGET_KEY'));
});
