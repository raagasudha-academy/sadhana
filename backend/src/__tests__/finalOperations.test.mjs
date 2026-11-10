import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsRoute} from '../finalOperations.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final'};
const calls=[];
const readers={
  assertConfigured:()=>calls.push('configured'),
  core:async kind=>(calls.push(`core:${kind}`),{records:[{id:'S1',name:'Student',phone:'private'}],more:false}),
  directory:async action=>action==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[{id:'C1',teacherId:'T1'},{id:'C2',teacherId:'T2'}]},
  teacherStudents:async (_,ids)=>(calls.push('teacherStudents'), assert.deepEqual([...ids],['C1']),[{id:'S1',name:'Student',rollNumber:'',institution:'raaga'}]),
};
const access={
  view:(_,inst)=>{if(inst==='sruti')throw Object.assign(Error('forbidden'),{status:403});},
  admin:(claims)=>{if(!claims.admin)throw Object.assign(Error('forbidden'),{status:403});},
  permittedInstitutions:claims=>claims.admin?['raaga']:[],
  badInstitution:()=>{throw Object.assign(Error('bad'),{status:400});},
  forbid:()=>{throw Object.assign(Error('forbidden'),{status:403});},
};
const ctx=(resource,admin=false,method='GET',inst='raaga')=>({parts:['operations',resource],method,claims:{sub:'abc',admin},query:{institution:inst}});
const run=(ctxArg,envArg=env,deps=readers)=>finalOperationsRoute(ctxArg,deps,access,envArg);
test('canonical admin family and student operations preserve records response',async()=>{
  calls.length=0;
  for(const kind of ['family','student']){
    const output=await run(ctx(kind,true));assert.equal(output.status,200);
    assert.equal(output.body.records[0].id,'S1');
  }
  assert.deepEqual(calls.filter(x=>x.startsWith('core:')),['core:families','core:students']);
});
test('teacher student selector only receives assigned classes and returns redacted students',async()=>{
  calls.length=0;
  const output=await run(ctx('student'));
  assert.deepEqual(output.body.records,[{id:'S1',name:'Student',rollNumber:'',institution:'raaga'}]);
  assert.ok(!calls.includes('core:students'));
});
test('teacher cannot access family contacts',async()=>{
  calls.length=0;
  await assert.rejects(()=>run(ctx('family')),{status:403});
  assert.ok(!calls.includes('core:families'));
});
test('no legacy fallback, writes, nested routes, invalid institution, cross academy',async()=>{
  assert.equal(await run(ctx('family',true),{SADHANA_ENTITY_TABLE_SET:'split'}),undefined);
  assert.equal(await run(ctx('student',true,'POST')),undefined);
  assert.equal(await run({...ctx('student',true),parts:['operations','student','123']}),undefined);
  await assert.rejects(()=>run(ctx('student',true,'GET','invalid')),{status:400});
  await assert.rejects(()=>run(ctx('student',true,'GET','sruti')),{status:403});
});
test('no teacher assignment means empty result; unverified teacher denied',async()=>{
  const empty={...readers,directory:async action=>action==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[]},teacherStudents:async()=>{throw Error('Should not query');}};
  assert.deepEqual((await run(ctx('student'),env,empty)).body,{records:[]});
  const denied={...readers,directory:async()=>({linked:false})};
  await assert.rejects(()=>run(ctx('student'),env,denied),{status:403});
});
test('real Lambda dispatches canonical operations before final-only boundary',()=>{
  const source=readFileSync(new URL('../lambda.ts',import.meta.url),'utf8');
  const i=source.indexOf('finalOperationsRoute(routeContext');
  assert.ok(i>0&&i<source.indexOf("finalOnlyGate(parts,method,'fallback')"));
  assert.ok(i<source.indexOf('operationsRoutes(routeContext)'));
});
