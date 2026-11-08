import test from 'node:test';
import assert from 'node:assert/strict';
import {GetCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeM10CoreWriteService} from '../src/m10CoreWriteService.ts';

const record=(overrides:Record<string,any>={})=>({
 personId:'PERSON-STUDENT-1',personTypes:['student'],institutionIds:['raaga'],status:'active',
 familyId:'FAMILY-1',version:3,firstName:'Asha',lastName:'K',displayName:'Asha K',
 studentProfile:{rollNumbers:{raaga:'RS-001'}},
 legacyPayload:{id:'PERSON-STUDENT-1',name:'Asha K',familyId:'FAMILY-1',createdIn:'raaga',visibleIn:['raaga'],registrationType:'family',adultConfirmed:false,version:3,archived:false},
 ...overrides,
});
function serviceFor(person:Record<string,any>|undefined,failTransaction=false){
 const calls:any[]=[];
 const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof GetCommand)return {Item:person};
  if(command instanceof TransactWriteCommand){if(failTransaction)throw Object.assign(new Error('stale'),{name:'TransactionCanceledException'});return {};}
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 return {service:makeM10CoreWriteService(db),calls};
}

test('administrator student name edit writes versioned person and audit in one conditional transaction',async()=>{
 const {service,calls}=serviceFor(record());
 const result=await service.update('students','raaga',{sub:'admin-sub'},'PERSON-STUDENT-1',{expectedVersion:3,name:' Asha New K '});
 assert.equal(result.name,'Asha New K');assert.equal(result.version,4);
 const tx=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(tx.length,2);
 assert.equal(tx[0].Put.TableName,'sadhana-dev-m9-people');
 assert.equal(tx[0].Put.Item.displayName,'Asha New K');
 assert.equal(tx[0].Put.Item.firstName,'Asha');
 assert.equal(tx[0].Put.Item.lastName,'New K');
 assert.equal(tx[0].Put.Item.version,4);
 assert.match(tx[0].Put.ConditionExpression,/contains\(#i,:inst\)/);
 assert.equal(tx[0].Put.ExpressionAttributeValues[':v'],3);
 assert.equal(tx[1].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(tx[1].Put.Item.actorCognitoSub,'admin-sub');
 assert.equal(tx[1].Put.Item.resourceType,'students');
 assert.equal(tx[1].Put.Item.resourceId,'PERSON-STUDENT-1');
});

test('administrator student update rejects phone and protected fields before database access',async()=>{
 const {service,calls}=serviceFor(record());
 await assert.rejects(service.update('students','raaga',{sub:'admin-sub'},'PERSON-STUDENT-1',{expectedVersion:3,phone:'+447700900111'}),{status:400});
 assert.equal(calls.length,0);
});

test('administrator student update checks academy scope, current version, and shared identities',async()=>{
 const cross=serviceFor(record({institutionIds:['sruti']}));
 await assert.rejects(cross.service.update('students','raaga',{sub:'admin-sub'},'PERSON-STUDENT-1',{expectedVersion:3,name:'Other'}),{status:403});
 assert.equal(cross.calls.some(x=>x instanceof TransactWriteCommand),false);

 const stale=serviceFor(record({version:4}));
 await assert.rejects(stale.service.update('students','raaga',{sub:'admin-sub'},'PERSON-STUDENT-1',{expectedVersion:3,name:'Other'}),{status:409});
 assert.equal(stale.calls.some(x=>x instanceof TransactWriteCommand),false);

 const shared=serviceFor(record({institutionIds:['raaga','sruti']}));
 await assert.rejects(shared.service.update('students','raaga',{sub:'admin-sub'},'PERSON-STUDENT-1',{expectedVersion:3,name:'Other'}),{status:409});
 assert.equal(shared.calls.some(x=>x instanceof TransactWriteCommand),false);
});

test('administrator student update converts transaction races to conflict',async()=>{
 const {service}=serviceFor(record(),true);
 await assert.rejects(service.update('students','raaga',{sub:'admin-sub'},'PERSON-STUDENT-1',{expectedVersion:3,name:'Asha New'}),{status:409});
});
