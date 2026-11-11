import assert from 'node:assert/strict';
import test from 'node:test';
import {GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {makeM10FinalFamilyAccessReader} from '../finalFamilyAccessData.ts';
import {parentEmailRouteKey} from '../parentEmailRoute.mjs';

const subject='12345678-1234-1234-1234-123456789abc';
const username='parent-0123456789abcdef0123456789abcdef';
const email='parent@example.org';
const route={counterId:parentEmailRouteKey(username),sequenceType:'PARENT_EMAIL_ROUTE',institutionId:'sruti',status:'pending',registrationId:'web_registration',familyId:'fam_parent',recipientEmail:email};
const registration={registrationId:route.registrationId,institutionId:'sruti',source:'website',importStatus:'imported',provisioningStatus:'INVITATION_SENT',familyId:route.familyId,parentAccountSub:subject,parentAccountUsername:username,parentAccountEmail:email};
const family={familyId:route.familyId,institutionIds:['sruti'],status:'active',primaryContactPersonId:'per_parent'};
const guardian:any={personId:family.primaryContactPersonId,familyId:family.familyId,institutionIds:['sruti'],personTypes:['guardian'],status:'active',email,version:1};

test('confirmed invited Sruti parent links transactionally with the reserved source alias',async()=>{
 const envKeys=['SADHANA_ENTITY_STAGE','SADHANA_ENTITY_TABLE_SET','SADHANA_ENTITY_FINAL_ACK','SADHANA_DATA_MODE','SADHANA_COGNITO_USER_POOL_ID'];
 const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{SADHANA_ENTITY_STAGE:'dev',SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final',SADHANA_COGNITO_USER_POOL_ID:'test-pool'});
 try{
  let linkedGuardian=guardian;
  let transaction:any[]=[];
  const db={async send(command:any){
   if(command instanceof GetCommand){
    const key=command.input.Key;
    if(key.counterId===route.counterId)return {Item:route};
    if(key.registrationId===registration.registrationId)return {Item:registration};
    if(key.familyId===family.familyId)return {Item:family};
    if(key.personId===guardian.personId)return {Item:linkedGuardian};
    if(key.counterId?.startsWith('COGNITO_SUB#'))return {};
   }
   if(command instanceof QueryCommand){
     assert.equal(command.input.TableName,'sadhana-dev-people');
     assert.equal(command.input.IndexName,'CognitoIdentityIndex');
     assert.equal(command.input.ExpressionAttributeValues?.[':value'],subject);
     return {Items:[]};
   }
   if(command instanceof TransactWriteCommand){
    transaction=command.input.TransactItems;
    linkedGuardian={...guardian,cognitoSub:subject,version:2};
    return {};
   }
   throw new Error(`Unexpected DynamoDB command: ${command.constructor.name}`);
  }};
  const cognito={async send(command:any){
   assert.ok(command instanceof ListUsersCommand);
   assert.equal(command.input.Filter,`sub = "${subject}"`);
   return {Users:[{Username:username,Enabled:true,UserStatus:'CONFIRMED',Attributes:[
    {Name:'sub',Value:subject},{Name:'email',Value:email},{Name:'email_verified',Value:'true'}]}]};
  }};
  const reader=makeM10FinalFamilyAccessReader(db as any,cognito,'test-pool');
  const linked=await reader.linkInvitedSrutiParent(subject);
  assert.equal(linked?.cognitoSub,subject);
  const registrationUpdate=transaction.find(action=>action.Update?.TableName==='sadhana-dev-registrations')?.Update;
  assert.match(registrationUpdate.ConditionExpression,/#source=:source/);
  assert.equal(registrationUpdate.ExpressionAttributeNames['#source'],'source');
  assert.doesNotMatch(registrationUpdate.ConditionExpression,/(^|\s)source=:source/);
 }finally{
  for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});
