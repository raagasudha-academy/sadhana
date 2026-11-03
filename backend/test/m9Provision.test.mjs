import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTemplate } from '../scripts/m9ProvisionTemplate.mjs';
import { FRESH_INSTITUTIONS } from '../scripts/m9FreshStartCore.mjs';

test('provisions exactly 18 fresh dev tables', () => {
 const t=makeTemplate();
 const names=Object.values(t.Resources).map(r=>r.Properties.TableName);
 assert.equal(names.length,18);
 assert.equal(new Set(names).size,18);
 assert.ok(names.includes('sadhana-dev-m9-institutions'));
 assert.ok(names.includes('sadhana-dev-m9-audit'));
 assert.ok(names.every(n=>n.startsWith('sadhana-dev-m9-')));
});
test('all tables retain data on stack removal and protect deletion',()=>{
 const t=makeTemplate();
 for(const r of Object.values(t.Resources)){
  assert.equal(r.DeletionPolicy,'Retain');
  assert.equal(r.UpdateReplacePolicy,'Retain');
  assert.equal(r.Properties.DeletionProtectionEnabled,true);
  assert.equal(r.Properties.BillingMode,'PAY_PER_REQUEST');
  assert.equal(r.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled,true);
 }
});
test('every GSI references declared string attributes',()=>{
 for(const r of Object.values(makeTemplate().Resources)){
  const attrs = new Set(r.Properties.AttributeDefinitions.map(a=>a.AttributeName));
  for(const key of [...r.Properties.KeySchema,...(r.Properties.GlobalSecondaryIndexes??[]).flatMap(g=>g.KeySchema)])
   assert.ok(attrs.has(key.AttributeName));
 }
});
test('production template blocked',()=>assert.throws(()=>makeTemplate('prod'),/dev environment only/));
test('two fresh institution seeds, no operational records',()=>assert.deepEqual(FRESH_INSTITUTIONS.map(i=>i.institutionId),['raaga','sruti']));
