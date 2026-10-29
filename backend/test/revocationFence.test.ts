import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {acquireFenceTransaction,releaseFenceTransaction,assertFenceStudents} from '../src/revocationFence.ts';
const students=[{id:'STUDENT-abc',version:3,sourceWebsiteRegistrationId:'RS-TEST',familyId:'FAMILY-abc'}];
test('fence and journal are written atomically with ownership and version predicates',()=>{
 const cmd=acquireFenceTransaction('students','RS-TEST','FAMILY-abc',students,'REVOKE-test','admin','2026-10-26T00:00:00Z');
 const entries=cmd.input.TransactItems!;
 assert.equal(entries.length,2);
 assert.equal((entries[0] as any).Put.Item.status,'fenced');
 const u=(entries[1] as any).Update;
 assert.match(u.ConditionExpression,/sourceWebsiteRegistrationId/);
 assert.match(u.ConditionExpression,/attribute_not_exists\(revocationState\)/);
 assert.equal(u.ExpressionAttributeValues[':next'],4);
});
test('fence release is conditional on operation ID and version',()=>{
 const cmd=releaseFenceTransaction('students','RS-TEST',students,'REVOKE-test');
 const u=(cmd.input.TransactItems![0] as any).Update;
 assert.match(u.ConditionExpression,/revocationOperationId=:op/);
 assert.equal(u.ExpressionAttributeValues[':previous'],4);
 assert.equal((cmd.input.TransactItems![1] as any).Update.ExpressionAttributeValues[':released'],'released');
});
test('fencing fails closed on mismatched ownership, version or duplicates',()=>{
 assert.throws(()=>assertFenceStudents('RS-TEST','FAMILY-abc',[{...students[0],version:undefined as any}]));
 assert.throws(()=>assertFenceStudents('RS-TEST','FAMILY-abc',[{...students[0],familyId:'wrong'}]));
 assert.throws(()=>assertFenceStudents('RS-TEST','FAMILY-abc',[...students,...students]));
});
