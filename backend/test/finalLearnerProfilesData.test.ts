import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeM10FinalLearnerProfilesData} from '../src/finalLearnerProfilesData.ts';

const envKeys=['SADHANA_ENTITY_STAGE','SADHANA_ENTITY_TABLE_SET','SADHANA_DATA_MODE','SADHANA_ENTITY_FINAL_ACK'] as const;
let previous:string[];
before(()=>{
 previous=envKeys.map(k=>process.env[k]||'\0');
 process.env.SADHANA_ENTITY_STAGE='test';process.env.SADHANA_ENTITY_TABLE_SET='m9';
 delete process.env.SADHANA_DATA_MODE;delete process.env.SADHANA_ENTITY_FINAL_ACK;
});
after(()=>envKeys.forEach((k,i)=>previous[i]==='\0'?delete process.env[k]:process.env[k]=previous[i]));

const student={personId:'PERSON-STUDENT-1',cognitoSub:'student-sub',personTypes:['student'],institutionIds:['raaga'],status:'active',familyId:'FAMILY-1',version:4,
 studentProfile:{rollNumbers:{raaga:'RS-001'}},learnerPreferences:{preferredName:'Sia',phone:'',about:'',version:2}};
const guardian={personId:'PERSON-GUARDIAN-1',cognitoSub:'guardian-sub',personTypes:['guardian'],institutionIds:['raaga'],status:'active',familyId:'FAMILY-1',version:3};
const link={linkId:'LINK-APPROVED-1',guardianPersonId:guardian.personId,studentId:student.personId,institutionId:'raaga',familyId:'FAMILY-1',accessStatus:'approved',relationshipVerified:true};

function adapter(actor:'self'|'guardian',failTransaction=false){
 const calls:any[]=[];
 const identity=actor==='self'?student:guardian;
 const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof QueryCommand){
   if(command.input.IndexName==='CognitoIdentityIndex')return {Items:[identity]};
   if(command.input.IndexName==='GuardianAccessIndex')return {Items:[link]};
  }
  if(command instanceof GetCommand){
   const id=command.input.Key?.personId;
   if(id===student.personId)return {Item:student};
   if(id===guardian.personId)return {Item:guardian};
   if(command.input.Key?.linkId===link.linkId)return {Item:link};
  }
  if(command instanceof TransactWriteCommand){
   if(failTransaction)throw Object.assign(new Error('condition failed'),{name:'TransactionCanceledException'});
   return {};
  }
  throw new Error(`Unexpected ${command.constructor.name}`);
 }};
 return {service:makeM10FinalLearnerProfilesData(db,{send:async()=>({})},{adminPhotoUrl:async()=>'',ownProfilePhoto:async()=>''}),calls};
}

test('student self preference adapter conditions on the same Cognito subject and audits atomically',async()=>{
 const {service,calls}=adapter('self');
 const result=await service.saveProfile('raaga',{sub:'student-sub'},student.personId,{preferredName:'Sia',phone:'+447700900111',about:'Music',expectedVersion:2});
 assert.deepEqual(result,{updated:true,version:3});
 const actions=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(actions.length,2);
 const person=actions[0].Put;
 assert.equal(person.TableName,'sadhana-test-m9-people');
 assert.equal(person.Item.learnerPreferences.preferredName,'Sia');
 assert.equal(person.Item.learnerPreferences.version,3);
 assert.equal(person.Item.version,5);
 assert.match(person.ConditionExpression,/cognitoSub=:subject/);
 assert.equal(person.ExpressionAttributeValues[':subject'],'student-sub');
 assert.equal(actions[1].Put.Item.action,'learnerProfilePreferencesUpdate');
 assert.equal(actions[1].Put.Item.actorCognitoSub,'student-sub');
 assert.equal(actions[1].Put.Item.actorPersonId,student.personId);
});

test('parent preference adapter rechecks active same-family guardian and approved link in transaction',async()=>{
 const {service,calls}=adapter('guardian');
 await service.saveProfile('raaga',{sub:'guardian-sub'},student.personId,{preferredName:'Sia',phone:'',about:'Music',expectedVersion:2});
 const actions=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(actions.length,4);
 const guardianCheck=actions.find((x:any)=>x.ConditionCheck?.TableName==='sadhana-test-m9-people')?.ConditionCheck;
 assert.match(guardianCheck.ConditionExpression,/cognitoSub=:subject/);
 assert.match(guardianCheck.ConditionExpression,/familyId=:family/);
 const linkCheck=actions.find((x:any)=>x.ConditionCheck?.TableName==='sadhana-test-m9-family-links')?.ConditionCheck;
 assert.equal(linkCheck.Key.linkId,link.linkId);
 assert.match(linkCheck.ConditionExpression,/relationshipVerified=:verified/);
 assert.equal(linkCheck.ExpressionAttributeValues[':verified'],true);
 assert.equal(linkCheck.ExpressionAttributeValues[':family'],'FAMILY-1');
 const person=actions.find((x:any)=>x.Put?.TableName==='sadhana-test-m9-people').Put;
 assert.match(person.ConditionExpression,/familyId=:family/);
 assert.equal(person.ExpressionAttributeValues[':family'],'FAMILY-1');
 const audit=actions.find((x:any)=>x.Put?.TableName==='sadhana-test-m9-audit').Put.Item;
 assert.equal(audit.actorCognitoSub,'guardian-sub');
 assert.equal(audit.actorPersonId,guardian.personId);
 assert.equal(audit.resourceId,student.personId);
});

test('transaction condition failure becomes a profile/access conflict',async()=>{
 const {service}=adapter('self',true);
 await assert.rejects(service.saveProfile('raaga',{sub:'student-sub'},student.personId,
  {preferredName:'Sia',phone:'',about:'Music',expectedVersion:2}),{status:409});
});
