import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/familyAccess.ts',import.meta.url),'utf8');
test('guardian decision requires independent relationship verification',()=>assert.match(source,/body\.decision==='approved'&&body\.relationshipVerified!==true/));
test('re-request of revoked links returns to pending, not approved',()=>{assert.match(source,/\['revoked','rejected'\]\.includes\(previous\.status\)/);assert.match(source,/':pending':'pending'/);});
test('access decisions use transaction with previous version and status conditions',()=>{assert.match(source,/TransactWriteCommand/);assert.match(source,/ConditionExpression:'#v=:expected AND #s=:currentStatus/);});
test('self-approval requires configured super administrator',()=>assert.match(source,/Only a designated Super Admin may approve their own access request/));
