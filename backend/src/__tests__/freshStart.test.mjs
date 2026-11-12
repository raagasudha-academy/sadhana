import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFreshStartPlan } from '../../scripts/freshStartCore.mjs';

test('fresh start includes 18 unique table names', () => {
  const p = makeFreshStartPlan();
  assert.equal(p.physicalTables.length, 18);
  assert.equal(new Set(p.physicalTables).size, 18);
});
test('only two institutions are seeded', () => {
  const p = makeFreshStartPlan();
  assert.deepEqual(
    p.initialSeeds.map((s) => s.item.institutionId),
    ['raaga', 'sruti'],
  );
  assert.ok(p.initialSeeds.every((s) => s.tableName === 'sadhana-dev-institutions'));
});
test('never copies existing records or claims write readiness', () => {
  const p = makeFreshStartPlan();
  assert.equal(p.legacySourceRecordsToCopy, 0);
  assert.equal(p.canExecute, false);
  assert.equal(p.writesPerformed, 0);
  assert.equal(p.operationalReadiness, 'NOT_READY_FOR_CUTOVER');
});
test('supports environment naming only', () => {
  const p = makeFreshStartPlan({ environment: 'stage' });
  assert.ok(p.physicalTables.every((t) => t.startsWith('sadhana-stage-')));
  assert.throws(() => makeFreshStartPlan({ environment: '../prod' }));
});
test('does not invent teacher, student or calendar seed data', () => {
  const p = makeFreshStartPlan();
  assert.ok(p.initialSeeds.every((s) => s.tableName.endsWith('institutions')));
});
