import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const coordinator=readFileSync(new URL('../src/websiteRegistrationRevocation.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
test('coordinator acquires durable fence before its authoritative dependency scan',()=>{
 const acquisition=coordinator.indexOf('await db.send(acquireFenceTransaction(');
 const scanned=coordinator.indexOf('await failClosedDependencies(registrationId);',acquisition);
 const deleted=coordinator.indexOf('new TransactWriteCommand({TransactItems:items',scanned);
 assert.ok(acquisition>0&&scanned>acquisition&&deleted>scanned);
});
test('revocation remains protected by two deployment flags',()=>{
 assert.match(coordinator,/SADHANA_ENABLE_REVOKE_EXECUTION/);
 assert.match(coordinator,/SADHANA_REVOKE_WRITER_FENCE_VERIFIED/);
});
test('fenced operation can be cancelled only before deletion',()=>{
 assert.match(coordinator,/journal\.status!=='fenced'/);
 assert.match(coordinator,/confirmation!=='CANCEL'/);
 assert.match(routes,/Raagasudha administrator role required/);
 assert.match(routes,/revoke-cancel/);
});
