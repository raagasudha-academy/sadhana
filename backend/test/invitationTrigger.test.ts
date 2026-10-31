import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInvitationMessage,type InvitationEvent} from '../src/cognitoInvitationMessage.ts';
const make=(triggerSource='CustomMessage_AdminCreateUser'):InvitationEvent=>({triggerSource,request:{userAttributes:{name:'<img onerror=alert(1)>',email:'test@example.com'},codeParameter:'{####}',usernameParameter:'{username}'},response:{}});
test('admin-created invitation renders escaped branded email preserving Cognito placeholders',()=>{
 const e=buildInvitationMessage(make(),'https://raagasudha-academy.github.io/sadhana/');
 assert.match(e.response.emailMessage||'',/&lt;img/);
 assert.doesNotMatch(e.response.emailMessage||'',/<img/);
 assert.match(e.response.emailMessage||'',/\{####\}/);
 assert.match(e.response.emailMessage||'',/\{username\}/);
 assert.match(e.response.emailMessage||'',/https:\/\/raagasudha-academy\.github\.io\/sadhana\//);
 assert.ok(e.response.emailSubject);
});
test('unrelated trigger does not override verification or password reset messages',()=>{
 const e=make('CustomMessage_ForgotPassword');assert.equal(buildInvitationMessage(e,'https://raagasudha-academy.github.io/sadhana/').response.emailMessage,undefined);
});
test('rejects insecure URLs, absent placeholders and encoded markup',()=>{
 assert.throws(()=>buildInvitationMessage(make(),'http://example.org'));
 const e=make();e.request.codeParameter=undefined;
 assert.throws(()=>buildInvitationMessage(e,'https://raagasudha-academy.github.io/sadhana/'));
});
