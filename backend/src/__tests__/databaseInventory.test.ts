import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createRequire} from 'node:module';
// Load pure classifier without invoking the AWS entrypoint.
const require=createRequire(import.meta.url);
test('M8 read-only inventory preserves staff, academy, calendar, counters and audit categories',async()=>{
 const {classify}=await import('../../scripts/databaseInventory.mjs');
 for(const key of ['TEACHER_REGISTRY','TEACHER_SUB#abc','SCHEDULE#raaga','VENUE#abc','OPS#raaga#COUNTERS','AUDIT#x']){
  assert.ok(classify(key).startsWith('retain:'),key);
 }
});
test('M8 never classifies student/family/learning keys as safe to delete',async()=>{
 const {classify}=await import('../../scripts/databaseInventory.mjs');
 for(const key of ['OPS#GLOBAL#STUDENT','OPS#GLOBAL#FAMILY','OPS#raaga#HOMEWORK','OPS#sruti#PRACTICE','ACCESS#x']){
  assert.ok(classify(key).startsWith('review:'),key);
 }
});
test('M8 mode resolves five expected tables and refuses unknown legacy table',async()=>{
 const {resolveTables}=await import('../../scripts/databaseInventory.mjs');
 assert.equal(resolveTables({SADHANA_DATA_MODE:'split'}).length,5);
 assert.deepEqual(resolveTables({SADHANA_TABLE_NAME:'legacy-test'}),[{domain:'legacy',name:'legacy-test'}]);
 assert.throws(()=>resolveTables({}),/SADHANA_TABLE_NAME/);
});
