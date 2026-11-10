import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsRoute} from '../finalOperations.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final'};
const ctx=(inst='raaga',admin=false,method='GET')=>({parts:['operations','enrolment'],method,claims:{sub:'u',admin},query:{institution:inst}});
const access={
 view:(_,inst)=>{if(inst!=='raaga')throw Error('no access');},
 admin:()=>{}, permittedInstitutions:claims=>claims.admin?['raaga']:[],
 badInstitution:()=>{throw Error('invalid');},forbid:()=>{throw Error('forbidden');},
};
const calls=[];
const deps={
 assertConfigured:()=>{},
 core:async (kind,inst)=>(calls.push(['core',kind,inst]),{records:[{id:'E1'}]}),
 directory:async kind=>kind==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[{id:'C1',teacherId:'T1'},{id:'C2',teacherId:'T2'}]},
 teacherEnrolments:async (inst,ids)=>(calls.push(['teacher',inst,[...ids]]),{records:[{id:'E1',classId:'C1'}]}),
};
test('admin sees canonical enrolments for the selected institution',async()=>{
 calls.length=0;const r=await finalOperationsRoute(ctx('raaga',true),deps,access,env);
 assert.equal(r.status,200);assert.deepEqual(r.body,{records:[{id:'E1'}]});
 assert.deepEqual(calls,[['core','enrolments','raaga']]);
});
test('teacher only queries assigned classes, never admin enrolments',async()=>{
 calls.length=0;const r=await finalOperationsRoute(ctx(),deps,access,env);
 assert.equal(r.status,200);assert.deepEqual(calls,[['teacher','raaga',['C1']]]);
 assert.equal(r.body.records[0].classId,'C1');
});
test('unlinked teacher fails closed; no classes means no scan',async()=>{
 await assert.rejects(finalOperationsRoute(ctx(),{...deps,directory:async()=>({linked:false})},access,env),/forbidden/);
 const r=await finalOperationsRoute(ctx(),{...deps,directory:async k=>k==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[]},teacherEnrolments:()=>{throw Error('must not scan')}},access,env);
 assert.deepEqual(r.body,{records:[]});
});
test('writes and split mode remain behind boundary',async()=>{
 assert.equal(await finalOperationsRoute(ctx('raaga',true,'POST'),deps,access,env),undefined);
 assert.equal(await finalOperationsRoute(ctx('raaga',true),deps,access,{SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
 await assert.rejects(finalOperationsRoute(ctx('sruti',true),deps,access,env));
});
test('real Lambda binds canonical enrolment reader before fallback fence',()=>{
 const src=readFileSync(new URL('../lambda.ts',import.meta.url),'utf8');
 assert.match(src,/teacherEnrolments:finalTeacherEnrolments\(\)/);
 assert.ok(src.indexOf('finalOperationsRoute(routeContext')<src.indexOf("finalOnlyGate(parts,method,'fallback')"));
});
