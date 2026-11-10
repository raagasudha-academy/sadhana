import test from 'node:test';
import assert from 'node:assert/strict';
import {GetCommand,QueryCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {makeM10CoreWriteService} from '../coreWriteService.ts';

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

test('administrator family name edit updates primary contact and audit in one conditional transaction',async()=>{
 const family={familyId:'FAMILY-1',institutionIds:['raaga'],status:'active',version:2,primaryContactPersonId:'PERSON-GUARDIAN-1',
  legacyPayload:{id:'FAMILY-1',createdIn:'raaga',visibleIn:['raaga'],parentName:'Old Guardian',phone:'+447700900111',version:2,archived:false}};
 const guardian={personId:'PERSON-GUARDIAN-1',familyId:'FAMILY-1',institutionIds:['raaga'],personTypes:['guardian'],status:'active',version:4,
  firstName:'Old',lastName:'Guardian',displayName:'Old Guardian'};
 const calls:any[]=[];const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof GetCommand)return {Item:command.input.Key.familyId?family:guardian};
  if(command instanceof TransactWriteCommand)return {};
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 const service=makeM10CoreWriteService(db);
 const result=await service.update('families','raaga',{sub:'family-admin-sub'},'FAMILY-1',{expectedVersion:2,parentName:'New Primary Guardian'});
 assert.equal(result.parentName,'New Primary Guardian');assert.equal(result.version,3);
 const items=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(items.length,3);
 assert.equal(items[0].Put.TableName,'sadhana-dev-m9-families');
 assert.equal(items[0].Put.Item.version,3);
 assert.equal(items[1].Put.TableName,'sadhana-dev-m9-people');
 assert.equal(items[1].Put.Item.firstName,'New');assert.equal(items[1].Put.Item.lastName,'Primary Guardian');
 assert.equal(items[2].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(items[2].Put.Item.actorCognitoSub,'family-admin-sub');
 assert.equal(items[2].Put.Item.action,'ACADEMY_FAMILY_UPDATED');
});

test('family create allocates sequence and writes family, guardian, phone guard and audit atomically',async()=>{
 const calls:any[]=[];const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof GetCommand)return {Item:{lastAllocated:4}};
  if(command instanceof TransactWriteCommand)return {};
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 const service=makeM10CoreWriteService(db);
 const result:any=await service.create('families','raaga',{sub:'family-create-admin'},{parentName:'New Guardian',phone:'+447700900111',createdIn:'raaga'});
 assert.equal(result.familyNumber,'005');assert.equal(result.createdIn,'raaga');
 const tx=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(tx.length,5);
 assert.equal(tx[1].Put.TableName,'sadhana-dev-m9-families');
 assert.deepEqual(tx[1].Put.Item.institutionIds,['raaga']);
 assert.equal(tx[1].Put.Item.primaryContactPersonId,tx[2].Put.Item.personId);
 assert.deepEqual(tx[2].Put.Item.personTypes,['guardian']);
 assert.equal(tx[3].Put.Item.sequenceType,'FAMILY_PHONE_GUARD');
 assert.equal(tx[4].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(tx[4].Put.Item.actorCognitoSub,'family-create-admin');
 assert.equal(tx[4].Put.Item.action,'ACADEMY_FAMILY_CREATED');
});

test('enrolment create checks active same-academy parties and audits the pair lock transaction',async()=>{
 const calls:any[]=[];const student={personId:'PERSON-STUDENT-1',personTypes:['student'],institutionIds:['raaga'],status:'active',version:2};
 const cls={classId:'CLASS-1',institutionId:'raaga',status:'active',version:3};
 const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof GetCommand)return {Item:command.input.Key.personId?student:cls};
  if(command instanceof QueryCommand)return {Items:[]};
  if(command instanceof TransactWriteCommand)return {};
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 const service=makeM10CoreWriteService(db);
 const result=await service.create('enrolments','raaga',{sub:'enrolment-admin'},
  {institution:'raaga',studentId:student.personId,classId:cls.classId,startDate:'2026-11-08',endDate:''});
 assert.equal(result.archived,false);assert.ok(result.id);
 const tx=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(tx.length,5);
 assert.equal(tx[0].ConditionCheck.TableName,'sadhana-dev-m9-people');
 assert.equal(tx[1].ConditionCheck.TableName,'sadhana-dev-m9-classes');
 assert.equal(tx[2].Put.Item.sequenceType,'ENROLMENT_PAIR_GUARD');
 assert.equal(tx[3].Put.TableName,'sadhana-dev-m9-enrolments');
 assert.equal(tx[4].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(tx[4].Put.Item.actorCognitoSub,'enrolment-admin');
 assert.equal(tx[4].Put.Item.action,'ACADEMY_ENROLMENT_CREATED');
});

test('parent Add Student create allocates a roll and keeps guardian access pending for admin review',async()=>{
 const family={familyId:'FAMILY-1',institutionIds:['raaga'],status:'active',version:2,primaryContactPersonId:'PERSON-GUARDIAN-1'};
 const guardian={personId:'PERSON-GUARDIAN-1',familyId:'FAMILY-1',institutionIds:['raaga'],personTypes:['guardian'],status:'active',version:3};
 const calls:any[]=[];const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof GetCommand){
   if(command.input.Key.familyId)return {Item:family};
   if(command.input.Key.personId)return {Item:guardian};
   return {Item:{lastAllocated:0}};
  }
  if(command instanceof ScanCommand)return {Items:[]};
  if(command instanceof TransactWriteCommand)return {};
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 const service=makeM10CoreWriteService(db);
 const result:any=await service.create('students','raaga',{sub:'student-create-admin'},
  {name:'Asha Student',email:'',phone:'',familyId:'FAMILY-1',registrationType:'family',createdIn:'raaga'});
 assert.equal(result.name,'Asha Student');assert.match(result.rollNumber,/^RS-/);
 const tx=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(tx.length,7);
 assert.equal(tx[0].Update.TableName,'sadhana-dev-m9-counters');
 assert.equal(tx[1].Put.Item.sequenceType,'ROLL_UNIQUE');
 assert.equal(tx[2].ConditionCheck.TableName,'sadhana-dev-m9-families');
 assert.equal(tx[3].ConditionCheck.TableName,'sadhana-dev-m9-people');
 assert.equal(tx[4].Put.TableName,'sadhana-dev-m9-people');
 assert.equal(tx[5].Put.TableName,'sadhana-dev-m9-family-links');
 assert.equal(tx[5].Put.Item.accessStatus,'pending');
 assert.equal(tx[5].Put.Item.relationshipVerified,false);
 assert.equal(tx[6].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(tx[6].Put.Item.action,'ACADEMY_STUDENT_CREATED');
});

test('repeated family student create with the same normalized name or email returns conflict without a second write',async()=>{
 const family={familyId:'FAMILY-1',institutionIds:['raaga'],status:'active',version:2,primaryContactPersonId:'PERSON-GUARDIAN-1'};
 const guardian={personId:'PERSON-GUARDIAN-1',familyId:'FAMILY-1',institutionIds:['raaga'],personTypes:['guardian'],status:'active',version:3};
 for(const existing of [
  {personId:'PERSON-STUDENT-1',familyId:'FAMILY-1',displayName:'Asha Student',email:''},
  {personId:'PERSON-STUDENT-2',familyId:'FAMILY-OTHER',displayName:'Different Student',email:'asha@example.org'},
 ]){
  const calls:any[]=[];const db={send:async(command:any)=>{
   calls.push(command);
   if(command instanceof GetCommand)return {Item:command.input.Key.familyId?family:guardian};
   if(command instanceof ScanCommand)return {Items:[existing]};
   if(command instanceof TransactWriteCommand)return {};
   throw new Error(`Unexpected command ${command.constructor.name}`);
  }};
  const service=makeM10CoreWriteService(db);
  const body={name:existing.email?'New Student':'  Asha   Student ',email:existing.email?' ASHA@example.org ':'',
   phone:'',familyId:'FAMILY-1',registrationType:'family',createdIn:'raaga'};
  await assert.rejects(service.create('students','raaga',{sub:'student-create-admin'},body),{status:409});
  assert.equal(calls.some(x=>x instanceof TransactWriteCommand),false);
 }
});

function enrolmentEndService(record:Record<string,any>|undefined,lock:Record<string,any>|undefined,fail=false){
 const calls:any[]=[];
 const db={send:async(command:any)=>{
  calls.push(command);
  if(command instanceof GetCommand){
   return {Item:command.input.TableName.endsWith('-enrolments')?record:lock};
  }
  if(command instanceof TransactWriteCommand){
   if(fail)throw Object.assign(new Error('conditional write failed'),{name:'TransactionCanceledException'});
   return {};
  }
  throw new Error(`Unexpected command ${command.constructor.name}`);
 }};
 return {service:makeM10CoreWriteService(db),calls};
}

const activeEnrolment={enrolmentId:'ENROLMENT-1',institutionId:'raaga',studentId:'PERSON-1',classId:'CLASS-1',
 status:'active',version:3,legacyPayload:{id:'ENROLMENT-1',archived:false,version:3}};
const enrolmentLock={counterId:'ENROLMENT_PAIR#raaga#PERSON-1#CLASS-1',enrolmentId:'ENROLMENT-1'};

test('ending enrolment archives the record, releases its own pair lock and audits atomically',async()=>{
 const {service,calls}=enrolmentEndService(activeEnrolment,enrolmentLock);
 const result=await service.endEnrolment('raaga',{sub:'enrolment-admin'},'ENROLMENT-1',{confirm:'DELETE',expectedVersion:3});
 assert.deepEqual(result,{deleted:true,enrolmentId:'ENROLMENT-1'});
 const tx=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(tx.length,3);
 assert.equal(tx[0].Put.TableName,'sadhana-dev-m9-enrolments');
 assert.equal(tx[0].Put.Item.status,'archived');assert.equal(tx[0].Put.Item.version,4);
 assert.equal(tx[0].Put.Item.legacyPayload.archived,true);assert.equal(tx[0].Put.Item.legacyPayload.version,4);
 assert.match(tx[0].Put.ConditionExpression,/#v=:v AND #i=:inst AND #s=:active/);
 assert.equal(tx[0].Put.ExpressionAttributeValues[':v'],3);
 assert.equal(tx[1].Put.TableName,'sadhana-dev-m9-audit');
 assert.equal(tx[1].Put.Item.action,'ACADEMY_ENROLMENT_ENDED');
 assert.equal(tx[1].Put.Item.actorCognitoSub,'enrolment-admin');
 assert.equal(tx[1].Put.Item.resourceId,'ENROLMENT-1');
 assert.equal(tx[2].Delete.TableName,'sadhana-dev-m9-counters');
 assert.match(tx[2].Delete.ConditionExpression,/#e=:id/);
});

test('ending enrolment rejects cross-academy, missing, archived and stale records without a write',async()=>{
 const cases=[
  {record:{...activeEnrolment,institutionId:'sruti'},status:403},
  {record:undefined,status:404},
  {record:{...activeEnrolment,status:'archived'},status:409},
  {record:{...activeEnrolment,version:4},status:409},
 ];
 for(const c of cases){
  const {service,calls}=enrolmentEndService(c.record,enrolmentLock);
  await assert.rejects(service.endEnrolment('raaga',{sub:'enrolment-admin'},'ENROLMENT-1',
   {confirm:'DELETE',expectedVersion:3}),{status:c.status});
  assert.equal(calls.some(x=>x instanceof TransactWriteCommand),false);
 }
});

test('ending enrolment fails closed if a pair lock belongs to another record',async()=>{
 const {service,calls}=enrolmentEndService(activeEnrolment,{...enrolmentLock,enrolmentId:'ENROLMENT-OTHER'});
 await assert.rejects(service.endEnrolment('raaga',{sub:'enrolment-admin'},'ENROLMENT-1',
  {confirm:'DELETE',expectedVersion:3}),{status:409});
 assert.equal(calls.some(x=>x instanceof TransactWriteCommand),false);
});

test('ending enrolment maps a conditional transaction race to conflict',async()=>{
 const {service}=enrolmentEndService(activeEnrolment,enrolmentLock,true);
 await assert.rejects(service.endEnrolment('raaga',{sub:'enrolment-admin'},'ENROLMENT-1',
  {confirm:'DELETE',expectedVersion:3}),{status:409});
});

test('ending enrolment rejects malformed confirmation before reading storage',async()=>{
 const {service,calls}=enrolmentEndService(activeEnrolment,enrolmentLock);
 for(const body of [
  {confirm:'delete',expectedVersion:3},
  {confirm:'DELETE',expectedVersion:0},
  {confirm:'DELETE',expectedVersion:3,force:true},
 ]){
  await assert.rejects(service.endEnrolment('raaga',{sub:'enrolment-admin'},'ENROLMENT-1',body),{status:400});
 }
 assert.equal(calls.length,0);
});

test('ending an imported enrolment without a pair lock keeps history and audits',async()=>{
 const {service,calls}=enrolmentEndService(activeEnrolment,undefined);
 await service.endEnrolment('raaga',{sub:'enrolment-admin'},'ENROLMENT-1',{confirm:'DELETE',expectedVersion:3});
 const tx=calls.find(x=>x instanceof TransactWriteCommand)?.input.TransactItems;
 assert.equal(tx.length,2);
 assert.equal(tx[0].Put.Item.status,'archived');
 assert.equal(tx[1].Put.Item.action,'ACADEMY_ENROLMENT_ENDED');
});
