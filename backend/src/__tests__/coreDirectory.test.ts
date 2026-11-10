import test from 'node:test';
import assert from 'node:assert/strict';
import {projectM10Directory} from '../coreDirectoryProjection.mjs';
import {makeM10CoreDirectoryReader} from '../coreDirectory.ts';
import {makeM10CoreDirectoryRoutes} from '../routes/coreDirectoryRoutes.ts';
const raaga={sub:'admin','cognito:groups':'raagasudha-admin'};
const sruti={sub:'admin2','cognito:groups':'sruti-admin'};
const student={personId:'per_1',personTypes:['student'],institutionIds:['raaga'],familyId:'fam_1',firstName:'Hari',lastName:'K',status:'active'};
const family={familyId:'fam_1',institutionIds:['raaga'],primaryContactPersonId:'per_guardian'};
test('M9 people projection excludes other institutions and guardian-only identities',()=>{
 const x=projectM10Directory('students',[student,{...student,personId:'per_2',institutionIds:['sruti']},{...student,personId:'per_3',personTypes:['guardian']}],'raaga');
 assert.deepEqual(x.records.map((x:any)=>x.id),['per_1']);
 assert.equal(x.records[0].name,'Hari K');
});
test('family projection refuses to invent missing private guardian contact data',()=>{
 assert.throws(()=>projectM10Directory('families',[family],'raaga'),/M10_FAMILY_CONTACT_JOIN_REQUIRED/);
 const joined=projectM10Directory('families',[family],'raaga',[{personId:'per_guardian',institutionIds:['raaga'],firstName:'Mira',lastName:'K',phone:'+447700900123'}]);
 assert.deepEqual(joined.records.map((row:any)=>[row.id,row.parentName,row.phone]),[['fam_1','Mira K','+447700900123']]);
 assert.throws(()=>projectM10Directory('families',[family],'raaga',[{personId:'per_guardian',institutionIds:['sruti'],firstName:'Mira',phone:'+447700900123'}]),/CONTACT_JOIN_REQUIRED/);
});
test('M9 enrolment projection is institution scoped',()=>{
 const row={enrolmentId:'EN1',institutionId:'raaga',studentId:'per_1',classId:'C1',startDate:'2026-10-01',status:'active'};
 assert.deepEqual(projectM10Directory('enrolments',[row,{...row,enrolmentId:'EN2',institutionId:'sruti'}],'raaga').records.map((x:any)=>x.id),['EN1']);
});
test('legacy payload preserves contract but strips PK SK and GSIs',()=>{
 const x=projectM10Directory('students',[{...student,legacyPayload:{id:'OLD-1',PK:'secret',SK:'META',GSI1PK:'lookup',name:'Existing'}}],'raaga');
 assert.deepEqual(x.records,[{id:'OLD-1',name:'Existing',rollNumber:''}]);
});
test('M9 core reader accesses entity tables and refuses cross-institution requests',async()=>{
 const calls:string[]=[];
 const reader=makeM10CoreDirectoryReader({send:async(cmd:any)=>{calls.push(cmd.input.TableName);return {Items:[student]};}});
 assert.equal((await reader.list('students','raaga',raaga)).records.length,1);
 assert.deepEqual(calls,['sadhana-dev-m9-people']);
 await assert.rejects(()=>reader.list('students','sruti',raaga),/administrator/i);
 assert.equal(calls.length,1);
});
test('shadow returns exact legacy result, never switches writes or leaks cross-institution data',async()=>{
 const old={records:[{id:'OLD-1',name:'Existing'}],more:false};
 const reader=makeM10CoreDirectoryReader({send:async()=>({Items:[student]})});
 const route=makeM10CoreDirectoryRoutes(()=>reader,async()=>old);
 const context:any={parts:['students'],method:'GET',query:{institution:'raaga'},inst:'raaga',claims:raaga,event:{},groups:['raaga']};
 const prior=process.env.M10_CORE_DIRECTORY_SHADOW;
 try {
  delete process.env.M10_CORE_DIRECTORY_SHADOW;
  assert.equal(await route(context),undefined);
  process.env.M10_CORE_DIRECTORY_SHADOW='enabled';
  assert.deepEqual(JSON.parse((await route(context))!.body),old);
  assert.equal(await route({...context,method:'POST'}),undefined);
  await assert.rejects(()=>route({...context,claims:sruti}),/administrator/i);
 }finally{if(prior===undefined)delete process.env.M10_CORE_DIRECTORY_SHADOW;else process.env.M10_CORE_DIRECTORY_SHADOW=prior;}
});
