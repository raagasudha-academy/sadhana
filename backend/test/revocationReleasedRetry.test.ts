import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {acquireFenceTransaction} from '../src/revocationFence.ts';
const student={id:'STUDENT-12345678-1234-1234-1234-123456789abc',version:5,sourceWebsiteRegistrationId:'RS-2026-TEST',familyId:'FAMILY-TEST'};
test('retry can replace only the specific released operation',()=>{
 const cmd=acquireFenceTransaction('test-table','RS-2026-TEST','FAMILY-TEST',[student],'REVOKE-new','admin','2026-10-26T20:00:00Z','REVOKE-old');
 const tx=(cmd as any).input.TransactItems;
 assert.equal(tx[0].Put.ConditionExpression,'#st=:released AND operationId=:previous');
 assert.equal(tx[0].Put.ExpressionAttributeValues[':previous'],'REVOKE-old');
 assert.equal(tx[1].Put.Item.type,'WEBSITE_IMPORT_REVOKE_RETRY');
 assert.equal(tx[2].Update.ExpressionAttributeValues[':previous'],5);
});
test('first attempt cannot overwrite an existing journal',()=>{
 const cmd=acquireFenceTransaction('test-table','RS-2026-TEST','FAMILY-TEST',[student],'REVOKE-new','admin','2026-10-26T20:00:00Z');
 const tx=(cmd as any).input.TransactItems;
 assert.equal(tx[0].Put.ConditionExpression,'attribute_not_exists(PK)');
 assert.equal(tx.length,2);
});
