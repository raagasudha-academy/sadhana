import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInvitationMessage,type InvitationEvent} from '../src/cognitoInvitationMessage.ts';
const make=(email:string):InvitationEvent=>({triggerSource:'CustomMessage_AdminCreateUser',request:{userAttributes:{name:'SK Kanakam',email},codeParameter:'{####}',usernameParameter:'{username}'},response:{}});
test('v13.9 invitation presents email, not internal Cognito username',()=>{
 const result=buildInvitationMessage(make('Student@Example.com'),'https://raagasudha-academy.github.io/sadhana/');
 const html=result.response.emailMessage||'';
 assert.match(html,/Sign-in email:<\/strong> student@example\.com/);
 assert.doesNotMatch(html,/Sign-in username:/);
 assert.match(html,/<span style="display:none" aria-hidden="true">\{username\}<\/span>/);
 assert.match(html,/\{####\}/);
});
test('v13.9 escapes email and refuses missing email',()=>{
 assert.throws(()=>buildInvitationMessage(make('bad<email>'),'https://raagasudha-academy.github.io/sadhana/'));
 assert.throws(()=>buildInvitationMessage(make(''),'https://raagasudha-academy.github.io/sadhana/'));
});
