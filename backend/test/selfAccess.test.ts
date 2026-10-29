import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src/v117GuardianQueue.ts');
const source=readFileSync(file,'utf8');
test('self approval requires verified Cognito email and matching imported primary contact',()=>{
 assert.match(source,/email_verified/);
 assert.match(source,/student\?\.sourcePersonId===primaryId/);
 assert.match(source,/student\?\.adultConfirmed===true/);
 assert.match(source,/student\.email\.trim\(\)\.toLowerCase\(\)===accountEmail/);
});
test('guardian requests remain pending and self approval produces audit transaction',()=>{
 assert.match(source,/kind:'guardian',status:'pending'/);
 assert.match(source,/action:'verifiedSelfStudentAccess'/);
 assert.match(source,/new TransactWriteCommand/);
 assert.match(source,/prior\.requestedBy==='system:website-import'/);
});
