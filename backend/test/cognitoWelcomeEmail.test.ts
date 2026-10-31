import test from 'node:test';
import assert from 'node:assert/strict';
import {parentInvitationTemplate} from '../src/parentInvitationTemplate.ts';
import {buildInvitationMessage,type InvitationEvent} from '../src/cognitoInvitationMessage.ts';
const LOGIN='https://raagasudha-academy.github.io/sadhana/';

test('welcome email contains real portal URL, branding and required placeholders',()=>{
 const event: InvitationEvent = {
  triggerSource: 'CustomMessage_AdminCreateUser',
  request: {
   userAttributes: {
    name: '<script>Test</script>',
    email: 'parent@example.com'
   },
   codeParameter: '{####}',
   usernameParameter: '{username}'
  },
  response: {}
 };

 const result = buildInvitationMessage(event, LOGIN);

 assert.match(result.response.emailMessage || '', /raagasudha-academy\.github\.io\/sadhana\//);
 assert.match(result.response.emailMessage || '', /\{####\}/);
 assert.match(result.response.emailMessage || '', /\{username\}/);
 assert.match(result.response.emailMessage || '', /Raagasudha/);
 assert.doesNotMatch(result.response.emailMessage || '', /<script>/);
});

test('invitation never contains unapproved URLs',()=>{
 for(const url of ['http://raagasudha-academy.github.io/sadhana/','https://evil.example/','https://raagasudha-academy.github.io.evil.example/sadhana/'])
  assert.throws(()=>parentInvitationTemplate('Parent','{####}',url));
});
test('unrelated Cognito messages remain unchanged',()=>{
 const event:InvitationEvent={triggerSource:'CustomMessage_ForgotPassword',request:{},response:{}};
 assert.equal(buildInvitationMessage(event,LOGIN),event);
});
