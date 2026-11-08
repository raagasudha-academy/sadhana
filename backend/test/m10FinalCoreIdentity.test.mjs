import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalCoreIdentityRoute} from '../src/m10FinalCoreIdentity.mjs';

const enabled = {
  SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',
  SADHANA_DATA_MODE:'off',SADHANA_FINAL_CORE_WRITES:'enabled',
  SADHANA_FINAL_GUARDIAN_REQUESTS:'enabled',SADHANA_FINAL_GUARDIAN_DECISIONS:'enabled'
};
let calls=[];
const deps={
 assertConfigured:()=>calls.push('schema'),
 parse:request=>(calls.push('parse'),JSON.parse(request.body??'{}')),
 core:()=>({
  create:async(root,inst,who,data)=>(calls.push(['create',root,inst,who.sub,data]),{id:'new'}),
  update:async(root,inst,who,id,data)=>(calls.push(['update',root,inst,who.sub,id,data]),{id})
 }),
 guardianReader:()=>({peopleForSubject:async()=>[{personId:'GUARDIAN-ID',cognitoSub:'guardian-sub',status:'active',institutionIds:['sruti'],personTypes:['guardian']}],person:async()=>({personId:'GUARDIAN-ID',cognitoSub:'guardian-sub',status:'active',institutionIds:['sruti'],personTypes:['guardian']})}),
 guardian:()=>({
  request:async(inst,who,data)=>(calls.push(['request',inst,who.sub,data]),{status:'pending'}),
  decide:async(inst,who,data)=>(calls.push(['decide',inst,who.sub,data]),{status:'approved'})
 })
};
const access={admin:(who,inst)=>{if(!who.admin?.includes(inst))throw Object.assign(Error('Not admin'),{status:403});}};
const raaga={sub:'real-jwt-sub',admin:['raaga']};
const sruti={sub:'sruti-sub',admin:['sruti']};
const guardian={sub:'guardian-jwt',admin:[]};
const request=(path,method='POST',institution='raaga',who=raaga,data={name:'Family'})=>({
 parts:path.split('/'),method,query:{institution},inst:institution,claims:who,event:{body:JSON.stringify(data)}
});
const run=(path,method='POST',institution='raaga',who=raaga,data={name:'Family'},env=enabled)=>
 finalCoreIdentityRoute(request(path,method,institution,who,data),deps,access,env);
const reset=()=>calls=[];

test('M9/split mode remains unaffected and calls no services',async()=>{
 reset();assert.equal(await run('families','POST','raaga',raaga,{}, {...enabled,SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
 assert.deepEqual(calls,[]);
});
test('canonical core GET stays with the final read adapter',async()=>{
 reset();assert.equal(await run('students','GET'),undefined);assert.deepEqual(calls,[]);
});
test('final core writes require ACK, no split, and independent flag before DB access',async()=>{
 for(const env of [
  {...enabled,SADHANA_DATA_MODE:'split'},
  {...enabled,SADHANA_ENTITY_FINAL_ACK:'disabled'},
  {...enabled,SADHANA_FINAL_CORE_WRITES:''}
 ]){
  reset();assert.equal((await run('students','POST','raaga',raaga,{},env)).status,503);assert.deepEqual(calls,[]);
 }
});
test('final core creates and updates use JWT identity, academy and M10 service',async()=>{
 reset();const a=await run('families','POST','raaga',raaga,{parentName:'Primary'});
 const b=await run('enrolments/ENROLMENT-123','PATCH','raaga',raaga,{expectedVersion:4,startDate:'2026-11-06'});
 assert.equal(a.status,201);assert.deepEqual(a.body,{record:{id:'new'}});
 assert.equal(b.status,200);assert.deepEqual(b.body,{record:{id:'ENROLMENT-123'}});
 assert.deepEqual(calls.filter(Array.isArray),[
  ['create','families','raaga','real-jwt-sub',{parentName:'Primary'}],
  ['update','enrolments','raaga','real-jwt-sub','ENROLMENT-123',{expectedVersion:4,startDate:'2026-11-06'}]
 ]);
});
test('canonical students POST is administrator-scoped and delegates to the core writer',async()=>{
 reset();const result=await run('students','POST','raaga',raaga,{name:'Student One',createdIn:'raaga',familyId:'FAMILY-1'});
 assert.equal(result.status,201);assert.deepEqual(result.body,{record:{id:'new'}});
 assert.deepEqual(calls.filter(Array.isArray),[['create','students','raaga','real-jwt-sub',{name:'Student One',createdIn:'raaga',familyId:'FAMILY-1'}]]);
});
test('admin cannot cross academy and guardian cannot create student records',async()=>{
 reset();await assert.rejects(()=>run('students','POST','sruti',raaga),{status:403});
 await assert.rejects(()=>run('families','POST','raaga',guardian),{status:403});
 assert.equal(calls.includes('schema'),false);
});
test('invalid academy rejected without looking up the service',async()=>{
 reset();const out=await run('students','POST','shared',raaga);assert.equal(out.status,400);assert.deepEqual(calls,[]);
});
test('unsupported core paths and deletion fail closed',async()=>{
 reset();assert.equal((await run('students','DELETE')).status,405);
 assert.equal((await run('students/abc','POST')).status,405);
 assert.equal((await run('students/../../etc','PATCH')).status,405);
 assert.deepEqual(calls,[]);
});
test('guardian request remains pending and uses authenticated requester identity',async()=>{
 reset();const result=await run('family-access/request','POST','raaga',guardian,{studentId:'STU-001'});
 assert.deepEqual(result,{status:201,body:{status:'pending'}});
 assert.deepEqual(calls.filter(Array.isArray),[['request','raaga','guardian-jwt',{studentId:'STU-001'}]]);
});
test('guardian review is restricted to administrator, distinct flag',async()=>{
 reset();await assert.rejects(()=>run('family-access/decide','POST','raaga',guardian),{status:403});
 assert.equal(calls.length,0);
 reset();const result=await run('family-access/decide','POST','sruti',sruti,{subject:'guardian-sub',studentId:'STU-001',expectedVersion:1,decision:'approved',relationshipVerified:true,evidenceReference:'review-ticket-123'});
 assert.equal(result.status,200);
 assert.deepEqual(calls.filter(Array.isArray),[['decide','sruti','sruti-sub',{guardianPersonId:'GUARDIAN-ID',studentId:'STU-001',expectedVersion:1,decision:'approved',relationshipVerified:true,evidenceReference:'review-ticket-123'}]]);
});
test('guardian decisions and requests have independent disabled-by-default flags',async()=>{
 reset();assert.equal((await run('family-access/request','POST','raaga',guardian,{}, {...enabled,SADHANA_FINAL_GUARDIAN_REQUESTS:''})).status,503);
 assert.equal((await run('family-access/decide','POST','raaga',raaga,{}, {...enabled,SADHANA_FINAL_GUARDIAN_DECISIONS:''})).status,503);
 assert.deepEqual(calls,[]);
});
test('guardian unsafe routes and unauthenticated claims are refused',async()=>{
 reset();assert.equal((await run('family-access/remove','POST','raaga',raaga)).status,503);
 assert.equal((await run('family-access/request','DELETE','raaga',raaga)).status,503);
 assert.equal((await run('family-access/request','POST','raaga',{})).status,401);
 assert.deepEqual(calls,[]);
});
test('final-only dispatcher blocks all legacy and pilot routes after approved adapters',()=>{
 const code=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 const core=code.indexOf('finalCoreIdentityRoute(routeContext');
 const self=code.indexOf('finalCognitoSelfRoute(routeContext');
 const finalGate=code.indexOf("finalOnlyGate(parts,method,'fallback')");
 const pilotRegistration=code.indexOf('await m10RegistrationCutoverRoutes(routeContext)');
 const pilotIdentity=code.indexOf('await m10IdentityFrontendRoutes(routeContext)');
 const learner=code.indexOf('await m9FinalLearnerRoutes(routeContext)');
 const repo=code.indexOf('await repository.create(resource');
 assert.ok(core>0 && self>core && finalGate>self);
 assert.ok(pilotRegistration>finalGate && pilotIdentity>finalGate && learner>finalGate && repo>finalGate);
 assert.ok(code.includes("process.env.SADHANA_ENTITY_TABLE_SET!=='final'"));
});


test('existing guardian request body is mapped to canonical pending-only request',async()=>{
 reset();const res=await run('family-access/request','POST','raaga',guardian,{studentId:'STU-001',kind:'guardian'});
 assert.equal(res.status,201);
 assert.deepEqual(calls.filter(Array.isArray),[['request','raaga','guardian-jwt',{studentId:'STU-001'}]]);
});
test('student self link and administrator-on-behalf guardian requests never map implicitly',async()=>{
 for(const body of [
  {studentId:'STU-001',kind:'student'},
  {studentId:'STU-001',kind:'guardian',beneficiarySubject:'other-account'},
  {rollNumber:'001-001',kind:'guardian'}
 ]){
  reset();const res=await run('family-access/request','POST','raaga',guardian,body);
  assert.equal(res.status,503);assert.equal(calls.some(Array.isArray),false);
 }
});
