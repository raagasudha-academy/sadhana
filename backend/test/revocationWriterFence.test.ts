import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {dependentStudentGuard,DEPENDENT_WRITER_KINDS} from '../src/revocationWriterFence.ts';
const table='test-table';
test('all five dependent write kinds are guarded',()=>{
 assert.deepEqual([...DEPENDENT_WRITER_KINDS],['enrolment','attendance','practice','feedback','rsvp']);
});
test('writer checks student version and both revocation fence attributes in transaction',async()=>{
 const db={send:async()=>({Item:{id:'STUDENT-abc',version:4}})};
 const entry=await dependentStudentGuard(db,table,'STUDENT-abc');
 assert.equal(entry.ConditionCheck.ExpressionAttributeValues[':v'],4);
 assert.match(entry.ConditionCheck.ConditionExpression,/attribute_not_exists\(revocationState\)/);
 assert.match(entry.ConditionCheck.ConditionExpression,/attribute_not_exists\(revocationOperationId\)/);
});
test('writer fails closed for missing and fenced student',async()=>{
 for(const Item of [undefined,{id:'STUDENT-abc',version:4,revocationState:'preparing'}]){
  await assert.rejects(dependentStudentGuard({send:async()=>({Item})},table,'STUDENT-abc'));
 }
});
