import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalReadRoute} from '../src/m10FinalReadRoutes.mjs';
import {finalOnlyGate} from '../src/m10FinalBoundary.mjs';

const ENV={SADHANA_ENTITY_TABLE_SET:'final'};
const user={sub:'sub-example',groups:['raaga']};
const calls=[];
const deps={
 assertConfigured:()=>calls.push(['configured']),
 schedule:async inst=>(calls.push(['schedule',inst]),{records:[inst],more:false}),
 directory:async (name,inst)=>(calls.push(['directory',name,inst]),name==='teacherMe'?{linked:inst==='raaga'}:{records:[name,inst],more:false}),
 managedEvents:async inst=>(calls.push(['events',inst]),{records:[]}),
 core:async (entity,inst)=>(calls.push(['core',entity,inst]),{records:[]}),
 audit:async inst=>(calls.push(['audit',inst]),{records:[]}),
 practice:async (inst,id)=>(calls.push(['practice',inst,id]),{records:[]}),
 profile:async sub=>(calls.push(['profile',sub]),{name:'Staff Display',photoUrl:'signed://example'}),
};
const adminInstitutions=c=>c.groups?.filter(x=>['raaga','sruti'].includes(x))??[];
const access={
 viewableInstitutions:adminInstitutions,
 permittedInstitutions:c=>c.admin??[],
 view:(c,inst)=>{if(!adminInstitutions(c).includes(inst))throw Object.assign(Error('Forbidden'),{status:403});},
 admin:(c,inst)=>{if(!c.admin?.includes(inst))throw Object.assign(Error('Admin required'),{status:403});},
 forbid:message=>{throw Object.assign(Error(message),{status:403});},
 badInstitution:()=>{throw Object.assign(Error('Bad institution'),{status:400});},
 badStudent:()=>{throw Object.assign(Error('Bad student'),{status:400});},
};
const ctx=(path,method='GET',query={},claims=user)=>({parts:path.split('/'),method,query,inst:query.institution,claims});
const run=(path,options={})=>finalReadRoute(ctx(path,options.method??'GET',options.query??{institution:'raaga'},options.claims??user),deps,access,options.env??ENV);
const reset=()=>calls.splice(0);

test('existing M9/live mode unchanged: no reader, no guard invocation',async()=>{
 reset();assert.equal(await run('classes',{env:{SADHANA_ENTITY_TABLE_SET:'m9'}}),undefined);assert.deepEqual(calls,[]);
});
test('only exact GET roots are intercepted, identity writes still blocked at boundary',async()=>{
 reset();for(const path of ['students/a','schedule/b','teachers/x','admin','me/profile','photos/me','family-access'])assert.equal(await run(path),undefined);
 assert.equal(await run('classes',{method:'PATCH'}),undefined);
 assert.equal(finalOnlyGate(['classes'],'PATCH','fallback',ENV).status,503);
 assert.deepEqual(calls,[]);
});
test('calendar reads for each institution and shared holidays require staff',async()=>{
 reset();await run('schedule');await run('schedule',{query:{institution:'shared'}});
 assert.deepEqual(calls.filter(x=>x[0]==='schedule'),[['schedule','raaga'],['schedule','shared']]);
 await assert.rejects(()=>run('schedule',{query:{institution:'shared'},claims:{sub:'one',groups:[]}}),{status:403});
 await assert.rejects(()=>run('schedule',{query:{institution:'sruti'}}),{status:403});
 await assert.rejects(()=>run('schedule',{query:{institution:'unknown'}}),{status:400});
 assert.deepEqual(calls.filter(x=>x[0]==='schedule'),[['schedule','raaga'],['schedule','shared']]);
});
test('class and venue reads use canonical directory, not repository',async()=>{
 reset();const c=await run('classes');const v=await run('venues');
 assert.equal(c.status,200);assert.equal(v.status,200);
 assert.deepEqual(calls.filter(x=>x[0]==='directory'),[['directory','classes','raaga'],['directory','venues','raaga']]);
});
test('teacher directory and self-link are permitted for scoped staff',async()=>{
 reset();await run('teachers');const own=await run('teachers/me');
 assert.equal(own.body.linked,true);assert.deepEqual(calls.filter(x=>x[0]==='directory'),[['directory','teachers','raaga'],['directory','teacherMe','raaga']]);
});
test('invalid or cross-academy institution is rejected before query',async()=>{
 reset();await assert.rejects(()=>run('classes',{query:{institution:'shared'}}),{status:400});
 await assert.rejects(()=>run('venues',{query:{institution:'sruti'}}),{status:403});
 assert.equal(calls.some(x=>x[0]==='directory'),false);
});
test('managed events, identities and audit require administrator grant',async()=>{
 for(const root of ['events','students','families','enrolments','audit','practice']) {
  reset();await assert.rejects(()=>run(root,{query:{institution:'raaga',studentId:'student-001'}}),{status:403});
  assert.equal(calls.some(x=>['core','events','audit','practice'].includes(x[0])),false);
 }
 reset();
 await assert.rejects(()=>run('events',{claims:{sub:'raaga-admin',groups:['raaga'],admin:['raaga']},query:{institution:'sruti'}}),{status:403});
 await assert.rejects(()=>run('events',{claims:{sub:'raaga-admin',groups:['raaga'],admin:['raaga']},query:{institution:'unknown'}}),{status:400});
 assert.equal(calls.some(x=>x[0]==='events'),false);
});
test('administrator operations dispatch to canonical readers with academy scope',async()=>{
 const claims={sub:'admin-sub',groups:['raaga','sruti'],admin:['raaga','sruti']};
 reset();for(const entity of ['events','students','families','enrolments','audit']) {
  const res=await run(entity,{claims,query:{institution:'sruti'}});assert.equal(res.status,200);
 }
 await run('practice',{claims,query:{institution:'sruti',studentId:'STU-1234'}});
 assert.deepEqual(calls.filter(x=>['events','core','audit','practice'].includes(x[0])),[
  ['events','sruti'],['core','students','sruti'],['core','families','sruti'],['core','enrolments','sruti'],['audit','sruti'],['practice','sruti','STU-1234']
 ]);
});
test('practice route rejects malformed student ID before reading',async()=>{
 const claims={sub:'admin-sub',groups:['raaga'],admin:['raaga']};
 reset();await assert.rejects(()=>run('practice',{claims,query:{institution:'raaga',studentId:'../../other'}}),{status:400});
 assert.equal(calls.some(x=>x[0]==='practice'),false);
});
test('GET /me uses final teacher links and Cognito profile, no legacy teacher lookup',async()=>{
 const claims={sub:'admin-sub',groups:['raaga','sruti'],admin:['raaga']};
 reset();const res=await run('me',{claims});assert.equal(res.status,200);
 assert.deepEqual(res.body,{subject:'admin-sub',institutions:['raaga','sruti'],adminInstitutions:['raaga'],teacherInstitutions:['raaga'],role:'admin',displayName:'Staff Display',photoUrl:'signed://example'});
 assert.deepEqual(calls.filter(x=>x[0]==='directory'),[['directory','teacherMe','raaga'],['directory','teacherMe','sruti']]);
 assert.deepEqual(calls.filter(x=>x[0]==='profile'),[['profile','admin-sub']]);
});
test('learner /me has no invented academy affiliation',async()=>{
 reset();const res=await run('me',{claims:{sub:'learner',groups:[]}});
 assert.deepEqual(res.body.institutions,[]);assert.equal(res.body.role,'learner');
 assert.equal(calls.some(x=>x[0]==='directory'),false);
});
test('locator refusal stops all data reads',async()=>{
 const denied={...deps,assertConfigured:()=>{throw Error('NO_FINAL_ACK');}};
 reset();await assert.rejects(()=>finalReadRoute(ctx('schedule','GET',{institution:'raaga'}),denied,access,ENV),/NO_FINAL_ACK/);
 assert.deepEqual(calls,[]);
});
test('real dispatcher runs final reads before other legacy/M10 routes and safety gate',()=>{
 const code=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 const finalAt=code.indexOf('finalReadRoute(routeContext,getFinalReads(),finalAccess)');
 assert.ok(finalAt>0);
 assert.ok(finalAt<code.indexOf('m10AuthoritativeSchedulingRoutes(routeContext)'));
 assert.ok(finalAt<code.indexOf("finalOnlyGate(parts,method,'early')"));
 assert.ok(code.includes('entityTable(\'people\')'));
});
