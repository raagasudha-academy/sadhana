import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeM10FinalLearnerProfiles,validateLearnerPreferences} from '../src/finalLearnerProfiles.mjs';
import {finalLearningRoute} from '../src/finalLearning.mjs';

const student={personId:'PERSON-student1',cognitoSub:'sub-self1',personTypes:['student'],institutionIds:['sruti'],status:'active',familyId:'FAMILY-100',version:4,displayName:'Student One',studentProfile:{rollNumbers:{sruti:'100-001'}},learnerPreferences:{preferredName:'Sia',phone:'',about:'Dance',version:2}};
const guardian={personId:'PERSON-guardian1',cognitoSub:'sub-guardian1',personTypes:['guardian'],institutionIds:['sruti'],status:'active',familyId:'FAMILY-100',version:5};
const approved={linkId:'link_12345',guardianPersonId:guardian.personId,studentId:student.personId,institutionId:'sruti',familyId:'FAMILY-100',accessStatus:'approved',relationshipVerified:true};
function fixture({asGuardian=false,link=approved,person=student}={}){
 const calls=[];const io={
  identities:async sub=>(calls.push('identities'),[{...(asGuardian?guardian:student),cognitoSub:sub}]),
  person:async id=>(calls.push(['person',id]),id===guardian.personId?guardian:person),
  guardianCandidates:async()=>(calls.push('candidates'),[approved]),
  link:async()=>(calls.push('freshLink'),link),
  enrolments:async()=>[{enrolmentId:'ENR-1',studentId:student.personId,institutionId:'sruti',status:'active',classId:'CLASS-1'}],
  enrolment:async()=>({enrolmentId:'ENR-1',studentId:student.personId,institutionId:'sruti',status:'active',classId:'CLASS-1'}),
  class:async()=>({classId:'CLASS-1',institutionId:'sruti',name:'Bharatanatyam',teacherPersonIds:[],legacyPayload:{teacher:'Teacher A',location:'Hall A'},status:'active'}),
  venue:async()=>null,
  publicDirectory:async()=>({institution:'sruti',administrators:[{name:'Admin A'}],teachers:[],venues:[]}),
  writePreferences:async opts=>(calls.push(['write',opts]),undefined),
 };
 return {service:makeM10FinalLearnerProfiles(io),calls,io};
}
const ctx=(path,method='GET',body={})=>({parts:path.split('/'),method,claims:{sub:'sub-self1'},query:{institution:'sruti'},event:{body:JSON.stringify(body)}});
const base={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_DATA_MODE:'off',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_LEARNER_EXTRAS_READS:'enabled',SADHANA_FINAL_LEARNER_PROFILE_WRITES:'enabled',SADHANA_FINAL_LEARNER_DIRECTORY_READS:'enabled',SADHANA_FINAL_LEARNER_PREFERENCES_PARITY:'enabled'};
const dependencies=(svc,calls)=>({assertConfigured:()=>calls.push('schema'),parse:event=>JSON.parse(event.body||'{}'),learnerProfiles:()=>svc});

test('existing mode and final without flags never touch canonical learner service',async()=>{
 const {service,calls}=fixture();
 assert.equal(await finalLearningRoute(ctx('learner/PERSON-student1/extras'),dependencies(service,calls),{...base,SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
 assert.equal((await finalLearningRoute(ctx('learner/PERSON-student1/extras'),dependencies(service,calls),{...base,SADHANA_FINAL_LEARNER_EXTRAS_READS:''})).status,503);
 assert.deepEqual(calls,[]);
});
test('final profile reads and writes remain blocked until legacy preference parity is explicitly acknowledged',async()=>{
 const {service,calls}=fixture();
 for(const route of [['learner/PERSON-student1/extras','GET'],['learner/PERSON-student1/profile','PATCH']]){
  assert.equal((await finalLearningRoute(ctx(route[0],route[1]),dependencies(service,calls),{...base,SADHANA_FINAL_LEARNER_PREFERENCES_PARITY:''})).status,503);
 }
 assert.deepEqual(calls,[]);
});
test('student self read projects legacy extras response from canonical classes and preferences',async()=>{
 const {service}=fixture();
 assert.deepEqual(await service.extras('sruti',{sub:'sub-self1'},student.personId),{
  student:{id:student.personId,name:'Student One',rollNumber:'100-001'},
  profile:{preferredName:'Sia',phone:'',about:'Dance',version:2},teachers:['Teacher A'],venues:['Hall A'],
  classes:[{classId:'CLASS-1',name:'Bharatanatyam',teacher:'Teacher A',venue:'Hall A'}]
 });
});
test('stale enrolment GSI candidates are rechecked against base records',async()=>{
 const {service,io}=fixture();
 io.enrolment=async()=>({enrolmentId:'ENR-1',studentId:student.personId,institutionId:'sruti',status:'archived',classId:'CLASS-1'});
 const result=await service.extras('sruti',{sub:'sub-self1'},student.personId);
 assert.deepEqual(result.classes,[]);
});
test('guardian access requires independently verified fresh link and matching family',async()=>{
 const {service}=fixture({asGuardian:true});
 const result=await service.academyDirectory('sruti',{sub:'sub-guardian1'},student.personId);
 assert.equal(result.institution,'sruti');
 for(const x of [{...approved,accessStatus:'revoked'},{...approved,relationshipVerified:false},{...approved,familyId:'FAMILY-other'},{...approved,institutionId:'raaga'}]){
  await assert.rejects(fixture({asGuardian:true,link:x}).service.extras('sruti',{sub:'sub-guardian1'},student.personId),{status:403});
 }
});
test('no profile or academy data is returned to unidentified subjects, different academy, or missing student',async()=>{
 const {service,calls}=fixture();
 await assert.rejects(service.extras('raaga',{sub:'sub-self1'},student.personId),{status:403});
 await assert.rejects(service.academyDirectory('sruti',{sub:'sub-self1'},'bad!'),{status:400});
 await assert.rejects(service.extras('sruti',{},student.personId),{status:401});
 await assert.rejects(fixture({person:null}).service.extras('sruti',{sub:'sub-self1'},student.personId),{status:403});
 assert.equal(calls.includes('candidates'),false);
});
test('profile writes validate exact legacy payload and use expected version',async()=>{
 const {service,calls}=fixture();
 const result=await service.saveProfile('sruti',{sub:'sub-self1'},student.personId,{preferredName:' Sia ',phone:' +44 123 ',about:'Learning',expectedVersion:2});
 assert.deepEqual(result,{updated:true,version:3});
 const write=calls.find(x=>Array.isArray(x)&&x[0]==='write')[1];
 assert.equal(write.actor.personId,student.personId);
 assert.equal(write.link,null);
 assert.equal(write.expectedVersion,2);
 assert.deepEqual(write.preferences,{preferredName:'Sia',phone:'+44 123',about:'Learning',version:3});
 await assert.rejects(service.saveProfile('sruti',{sub:'sub-self1'},student.personId,{preferredName:'Sia',phone:'',about:'',expectedVersion:1}),{status:409});
});
test('guardian writes carry the approved link to transactional authorization',async()=>{
 const {service,calls}=fixture({asGuardian:true});
 await service.saveProfile('sruti',{sub:'sub-guardian1'},student.personId,{preferredName:'Sia',phone:'',about:'',expectedVersion:2});
 const write=calls.find(x=>Array.isArray(x)&&x[0]==='write')[1];
 assert.equal(write.link.linkId,approved.linkId);
 assert.equal(write.actor.personId,guardian.personId);
});
test('profile validation rejects extra fields, HTML and corrupt version',()=>{
 for(const v of [null,[],{preferredName:'a',phone:'',about:'',expectedVersion:2,actor:'x'},
  {preferredName:'<h1>',phone:'',about:'',expectedVersion:2},
  {preferredName:'a',phone:'012abc',about:'',expectedVersion:2},
  {preferredName:'a',phone:'',about:'',expectedVersion:-1}])assert.throws(()=>validateLearnerPreferences(v),{status:400});
});
test('supported final profile and directory paths delegate after flags, schema and JWT checks',async()=>{
 const {service,calls}=fixture();
 for(const [path,method,body] of [
  ['learner/PERSON-student1/extras','GET',{}],
  ['learner/PERSON-student1/academy-directory','GET',{}],
  ['learner/PERSON-student1/profile','PATCH',{preferredName:'Sia',phone:'',about:'',expectedVersion:2}]
 ]){
  assert.equal((await finalLearningRoute(ctx(path,method,body),dependencies(service,calls),base)).status,200);
 }
 assert.equal(calls.filter(x=>x==='schema').length,3);
});
test('an invalid final learner route or missing approval does not fall through to legacy PK/SK',async()=>{
 const {service,calls}=fixture();
 assert.equal((await finalLearningRoute(ctx('learner/PERSON-student1/media'),dependencies(service,calls),base)).status,503);
 assert.equal((await finalLearningRoute(ctx('learner/PERSON-student1/extras'),dependencies(service,calls),{...base,SADHANA_DATA_MODE:'split'})).status,503);
 assert.equal((await finalLearningRoute({...ctx('learner/PERSON-student1/extras'),claims:{}},dependencies(service,calls),base)).status,401);
 assert.deepEqual(calls,[]);
});
test('lambda wires only new canonical profile reader before final-only boundary',()=>{
 const lambda=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 assert.match(lambda,/learnerProfiles:m10FinalLearnerProfiles/);
 const route=lambda.indexOf('await finalLearningRoute(routeContext');
 const gate=lambda.indexOf("finalOnlyGate(parts,method,'fallback')");
 assert.ok(route>0&&gate>route);
 const data=readFileSync(new URL('../src/finalLearnerProfilesData.ts',import.meta.url),'utf8');
 assert.match(data,/entityTable\('people'\)/);
 assert.match(data,/TransactWriteCommand/);
 assert.doesNotMatch(data,/makeRoutedClient|SADHANA_TABLE_NAME|OPS#GLOBAL#STUDENT|PROFILE#/);
});
