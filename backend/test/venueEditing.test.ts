import test from 'node:test';
import assert from 'node:assert/strict';
import { SadhanaRepository } from '../src/repository.ts';
import { validate, directoryFor } from '../src/model.ts';

const dual={sub:'dual-admin','cognito:groups':['raagasudha-admin','sruti-admin']};
const single={sub:'raaga-admin','cognito:groups':['raagasudha-admin']};
const sruti={sub:'sruti-admin','cognito:groups':['sruti-admin']};
const unauthorised={sub:'visitor','cognito:groups':[]};
const stored={
 PK:'VENUE#VENUE-NEWCASTLE',SK:'META',entityType:'VENUES',id:'VENUE-NEWCASTLE',
 name:'St. Aidans Community Centre',location:'Newcastle upon Tyne',
 address:'St. Aidans Community Centre, Princes Rd, Newcastle upon Tyne, NE3 5TT',
 version:1,updatedAt:'2026-10-15T12:00:00Z',createdAt:'2026-10-15T12:00:00Z',
 GSI1PK:'DIRECTORY#VENUE',GSI1SK:'NAME#st. aidans community centre#VENUE-NEWCASTLE'
};
function fakeRepo(){
 const sent:any[]=[];
 const client:any={send:async(command:any)=>{
   sent.push(command);
   if(command.constructor.name==='GetCommand')return {Item:stored};
   if(command.constructor.name==='TransactWriteCommand')return {};
   throw Error('Unexpected DB command '+command.constructor.name);
 }};
 return {repo:new SadhanaRepository({tableName:'sadhana-dev-main',client}),sent};
}

test('venue patch updates only VENUE row and AUDIT row; never touches schedule',async()=>{
 const {repo,sent}=fakeRepo();
 const result=await repo.patch('venues','VENUE-NEWCASTLE',{name:'Newcastle Teaching Centre',expectedVersion:1},'raaga',dual);
 assert.equal(result.id,stored.id);
 assert.equal(result.version,2);
 assert.equal(result.name,'Newcastle Teaching Centre');
 assert.equal(result.address,stored.address);
 assert.equal(result.GSI1PK,undefined);
 assert.equal(sent.filter(c=>c.constructor.name==='TransactWriteCommand').length,1);
 const writes=sent.find(c=>c.constructor.name==='TransactWriteCommand').input.TransactItems;
 assert.equal(writes.length,2);
 assert.equal(writes[0].Put.Item.PK,stored.PK);
 assert.match(writes[1].Put.Item.PK,/^AUDIT#raaga$/);
 assert.ok(writes.every((w:any)=>!w.Put.Item.PK.startsWith('SCHEDULE#')));
 assert.match(writes[0].Put.ConditionExpression,/#v = :expected/);
 assert.equal(writes[0].Put.Item.GSI1SK,'NAME#newcastle teaching centre#VENUE-NEWCASTLE');
});

test('either Raagasudha or Sruti administrator can edit the shared venue directory',async()=>{
 for(const [claims,inst] of [[single,'raaga'],[sruti,'sruti']] as const){
  const {repo,sent}=fakeRepo();
  const record=await repo.patch('venues','VENUE-NEWCASTLE',{address:'Updated location',expectedVersion:1},inst,claims);
  assert.equal(record.address,'Updated location');
  const writes=sent.find(c=>c.constructor.name==='TransactWriteCommand').input.TransactItems;
  assert.equal(writes[0].Put.Item.PK,stored.PK);
  assert.ok(writes.every((w:any)=>!w.Put.Item.PK.startsWith('SCHEDULE#')));
 }
});

test('a non-admin or admin writing as another academy cannot edit venues',async()=>{
 const {repo,sent}=fakeRepo();
 await assert.rejects(()=>repo.patch('venues','VENUE-NEWCASTLE',{address:'Updated',expectedVersion:1},'raaga',unauthorised),{status:403});
 await assert.rejects(()=>repo.patch('venues','VENUE-NEWCASTLE',{address:'Updated',expectedVersion:1},'sruti',single),{status:403});
 assert.equal(sent.length,0);
});

test('Sruti admin can create a venue and records an audit without writing calendar entries',async()=>{
 const sent:any[]=[];
 const client:any={send:async(command:any)=>{sent.push(command);return {};}};
 const repo=new SadhanaRepository({tableName:'sadhana-dev-main',client});
 const record=await repo.create('venues',{name:'Sruti Hall',location:'Durham',address:'Main Street'},'sruti',sruti);
 assert.equal(record.name,'Sruti Hall');
 const writes=sent.find(c=>c.constructor.name==='TransactWriteCommand').input.TransactItems;
 assert.equal(writes.length,2);
 assert.match(writes[0].Put.Item.PK,/^VENUE#/);
 assert.match(writes[1].Put.Item.PK,/^AUDIT#sruti$/);
 assert.ok(writes.every((w:any)=>!w.Put.Item.PK.startsWith('SCHEDULE#')));
});

test('venue patch rejects unexpected fields, mismatched version and missing updates',async()=>{
 const {repo,sent}=fakeRepo();
 await assert.rejects(()=>repo.patch('venues','VENUE-NEWCASTLE',{teacher:'Someone',expectedVersion:1},'raaga',dual),{status:400});
 await assert.rejects(()=>repo.patch('venues','VENUE-NEWCASTLE',{address:'Updated',expectedVersion:3},'raaga',dual),{status:409});
 await assert.rejects(()=>repo.patch('venues','VENUE-NEWCASTLE',{expectedVersion:1},'raaga',dual),{status:400});
 assert.equal(sent.filter(c=>c.constructor.name==='TransactWriteCommand').length,0);
});

test('venue validation supports optional postcode and notes, retains original directory index',()=>{
 const d=validate('venues',{name:'Newcastle',location:'Newcastle upon Tyne',address:'Princes Road',postcode:'NE3 5TT',notes:'Entrance by car park'});
 assert.equal(d.postcode,'NE3 5TT');
 assert.equal(directoryFor('venues',{...d,id:'VENUE-NEWCASTLE'}).GSI1PK,'DIRECTORY#VENUE');
 assert.throws(()=>validate('venues',{...d,postcode:'invalid!!!'}),{status:400});
});
