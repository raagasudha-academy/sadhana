import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {domainForPK} from '../src/tableRouter.ts';

test('access requests and verified links route to admin identity table',()=>{
 for(const inst of ['raaga','sruti']){
  assert.equal(domainForPK(`ACCESS_REQUEST#${inst}`),'admin');
  assert.equal(domainForPK(`ACCESS#${inst}#subject-123`),'admin');
 }
});
test('old partitions preserve their assigned domain',()=>{
 assert.equal(domainForPK('TEACHER_SUB#abc'),'admin');
 assert.equal(domainForPK('STUDENT#abc'),'students');
 assert.equal(domainForPK('PRACTICE#abc'),'learning');
 assert.equal(domainForPK('AUDIT#abc'),'audit');
 assert.throws(()=>domainForPK('UNRECOGNISED#abc'),/Unmapped DynamoDB partition/);
});
