import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM95DirectoryReader,presentM9Teachers,presentM9TeacherIdentity,presentM9Venues,sameDirectoryRows} from '../src/m95DirectoryCompatibility.ts';
import {makeM95DirectoryRoutes} from '../src/routes/m95DirectoryRoutes.ts';
const admin={sub:'cognito-1','cognito:groups':'raagasudha-admin'};
const viewer={sub:'somebody-else','cognito:groups':'raagasudha-viewer'};
const outsider={sub:'somebody-else','cognito:groups':'sruti-admin'};
const teacher={personId:'T1',personTypes:['teacher'],institutionIds:['raaga'],legacyPayload:{PK:'TEACHER_REGISTRY',SK:'TEACHER#T1',id:'TEACHER-11111111-1111-1111-1111-111111111111',displayName:'Test Teacher',institutions:['raaga'],subjects:['Vocal'],aliases:[],cognitoSub:'cognito-1',active:true,version:1}};
const venue={venueId:'VENUE-1',legacyPayload:{PK:'VENUE#VENUE-1',SK:'META',GSI1PK:'DIRECTORY#VENUE',GSI1SK:'NAME#v',id:'VENUE-1',name:'North Centre',location:'North',address:'1 High Street',postcode:'NE1',archived:false}};
const photo=async(sub:string)=>`photo/${sub}`;
test('teacher API retains legacy field shapes and privately hides Cognito subjects from viewers',async()=>{
 const a=await presentM9Teachers('raaga',admin,[teacher],photo);
 const b=await presentM9Teachers('raaga',viewer,[teacher],photo);
 assert.equal(a.records[0].cognitoSub,'cognito-1');
 assert.equal(b.records[0].cognitoSub,'');
 assert.equal(a.records[0].photoUrl,'photo/cognito-1');
 assert.equal(a.more,false);
 assert.equal(Reflect.get(a.records[0], 'id'),teacher.legacyPayload.id);
 await assert.rejects(()=>presentM9Teachers('sruti',admin,[teacher],photo),/access/i);
});
test('teacher identity uses subject equality and active institution scope',()=>{
 assert.deepEqual(presentM9TeacherIdentity('raaga',admin,[teacher]),{linked:true,teacherId:teacher.legacyPayload.id});
 assert.deepEqual(presentM9TeacherIdentity('raaga',viewer,[teacher]),{linked:false,teacherId:null});
 assert.throws(()=>presentM9TeacherIdentity('raaga',outsider,[teacher]),/access/i);
});
test('venue directory returns shared venue without DynamoDB index fields',()=>{
 const out=presentM9Venues('raaga',viewer,[venue]);
 assert.equal(out.records.length,1);
 assert.equal(out.records[0].name,'North Centre');
 assert.ok(!('GSI1PK' in out.records[0]));
});
test('directory canonical parity ignores volatile signed photo URLs',()=>{
 assert.ok(sameDirectoryRows([{id:'x',photoUrl:'expires-1'}],[{id:'x',photoUrl:'expires-2'}]));
 assert.ok(!sameDirectoryRows([{id:'x'}],[{id:'y'}]));
});
test('M9 directory reader paginates and uses only the new tables',async()=>{
 const calls:string[]=[];
 const mock={send:async(cmd:any)=>{calls.push(cmd.input.TableName);return {Items:cmd.input.TableName.endsWith('people')?[teacher]:[venue]};}};
 const r=makeM95DirectoryReader(mock,photo);
 assert.equal((await r.teachers('raaga',admin)).records.length,1);
 assert.equal((await r.venues('raaga',admin)).records.length,1);
 assert.deepEqual(calls,['sadhana-dev-m9-people','sadhana-dev-m9-venues']);
});
test('shadow mode returns legacy response while reading M9; pilot returns M9 and blocks cross-institution access',async()=>{
 const prior=process.env.M95_COMPAT_MODE;
 const r=makeM95DirectoryReader({send:async(cmd:any)=>({Items:cmd.input.TableName.endsWith('people')?[teacher]:[venue]})},photo);
 const route=makeM95DirectoryRoutes(()=>r,async()=>({records:[{id:'old',name:'Old Venue'}],more:false}),async()=>({records:[],more:false}),async()=>({linked:false,teacherId:null}));
 const context:any={parts:['venues'],method:'GET',query:{institution:'raaga'},inst:'raaga',claims:admin,event:{},groups:['raaga']};
 try{
  process.env.M95_COMPAT_MODE='shadow';
  assert.equal(JSON.parse((await route(context))!.body).records[0].id,'old');
  process.env.M95_COMPAT_MODE='pilot';
  assert.equal(JSON.parse((await route(context))!.body).records[0].id,'VENUE-1');
  await assert.rejects(()=>route({...context,claims:outsider}),/access/i);
  assert.equal(await route({...context,method:'PATCH'}),undefined);
 }finally{if(prior===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=prior;}
});

test('M9 class projection is institution-scoped and preserves legacy contract',async()=>{
 const {presentM9Classes}=await import('../src/m95DirectoryCompatibility.ts');
 const raagaClass={classId:'C1',institutionId:'raaga',legacyPayload:{PK:'CLASS#C1',SK:'META',id:'C1',institution:'raaga',name:'Vocal',version:1}};
 const srutiClass={classId:'C2',institutionId:'sruti',legacyPayload:{PK:'CLASS#C2',SK:'META',id:'C2',institution:'sruti',name:'Dance',version:1}};
 const result=presentM9Classes('raaga',viewer,[raagaClass,srutiClass]);
 assert.deepEqual(result.records,[{id:'C1',institution:'raaga',name:'Vocal',version:1}]);
 assert.equal(result.more,false);
 assert.throws(()=>presentM9Classes('sruti',viewer,[raagaClass,srutiClass]),/access/i);
});
test('class directory shadows only and never switches reads to M9 in pilot',async()=>{
 const prev=process.env.M95_COMPAT_MODE;
 const {presentM9Classes}=await import('../src/m95DirectoryCompatibility.ts');
 const raagaClass={classId:'C1',institutionId:'raaga',legacyPayload:{id:'C1',institution:'raaga',name:'Vocal'}};
 const mockReader:any={classes:async(inst:any,claims:any)=>presentM9Classes(inst,claims,[raagaClass])};
 const route=makeM95DirectoryRoutes(()=>mockReader,undefined,undefined,undefined,async()=>({records:[{id:'C1',institution:'raaga',name:'Vocal'}],more:false}));
 const context:any={parts:['classes'],method:'GET',query:{institution:'raaga'},inst:'raaga',claims:viewer,event:{},groups:[]};
 try{
  process.env.M95_COMPAT_MODE='shadow';
  assert.equal(JSON.parse((await route(context))!.body).records[0].name,'Vocal');
  process.env.M95_COMPAT_MODE='pilot';
  assert.equal(await route(context),undefined);
  process.env.M95_COMPAT_MODE='off';
  assert.equal(await route(context),undefined);
 }finally{if(prev===undefined)delete process.env.M95_COMPAT_MODE;else process.env.M95_COMPAT_MODE=prev;}
});
