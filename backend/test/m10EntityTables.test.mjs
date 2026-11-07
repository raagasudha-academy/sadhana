import test from 'node:test';
import assert from 'node:assert/strict';
import {ENTITY_NAMES,entityTable} from '../src/m10EntityTables.mjs';

function withConfig(overrides,work){
 const keys=['SADHANA_ENTITY_STAGE','SADHANA_ENTITY_TABLE_SET','SADHANA_ENTITY_FINAL_ACK','SADHANA_DATA_MODE'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
  for(const k of keys)delete process.env[k];
  Object.assign(process.env,overrides);
  work();
 } finally {
  for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 }
}

test('defaults to original M9 entity names with all 18 schemas',()=>withConfig({},()=>{
 assert.equal(ENTITY_NAMES.length,18);
 assert.equal(new Set(ENTITY_NAMES).size,18);
 assert.equal(entityTable('classes'),'sadhana-dev-m9-classes');
 assert.equal(entityTable('audit'),'sadhana-dev-m9-audit');
 assert.equal(entityTable('family-links'),'sadhana-dev-m9-family-links');
}));

test('canonical cutover is blocked while legacy split router is active',()=>withConfig({
 SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'split'
},()=>{
 assert.throws(()=>entityTable('classes'),/legacy split PK\/SK routing/);
}));

test('canonical cutover requires independent approval',()=>withConfig({SADHANA_ENTITY_TABLE_SET:'final'},()=>{
 assert.throws(()=>entityTable('audit'),/explicit cutover approval/);
}));

test('approved canonical names include the audit-records exception',()=>withConfig({
 SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled'
},()=>{
 assert.equal(entityTable('audit'),'sadhana-dev-audit-records');
 assert.equal(entityTable('classes'),'sadhana-dev-classes');
 assert.equal(entityTable('family-links'),'sadhana-dev-family-links');
}));

test('rejects unknown tables, stages, and invalid modes',()=>withConfig({},()=>{
 assert.throws(()=>entityTable('main'),/Unknown entity/);
 assert.throws(()=>entityTable('people',{stage:'production'}),/Unsupported entity stage/);
 assert.throws(()=>entityTable('people',{set:'typo'}),/must be m9 or final/);
 assert.equal(entityTable('people',{stage:'test'}),'sadhana-test-m9-people');
}));
