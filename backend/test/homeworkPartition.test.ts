import test from 'node:test';
import assert from 'node:assert/strict';
import {domainForPK} from '../src/tableRouter.ts';

test('homework submission partitions stay in learning table',()=>{
 for(const inst of ['raaga','sruti']) {
  assert.equal(domainForPK(`OPS#${inst}#HOMEWORK_SUBMISSION#HOMEWORK-81371fec-8afe-414e-a2ef-71bcd460249a`),'learning');
  assert.equal(domainForPK(`OPS#${inst}#HOMEWORK`),'learning');
  assert.equal(domainForPK(`OPS#${inst}#HOMEWORK_COMPLETION`),'learning');
 }
});

test('malformed or unknown submission partitions fail closed',()=>{
 assert.throws(()=>domainForPK('OPS#other#HOMEWORK_SUBMISSION#HOMEWORK-81371fec-8afe-414e-a2ef-71bcd460249a'),/Unmapped/);
 assert.throws(()=>domainForPK('OPS#raaga#HOMEWORK_SUBMISSION#invalid'),/Unmapped/);
});
