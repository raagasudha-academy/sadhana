import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsRoute} from '../src/finalOperations.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final'};
const access={view:()=>{},admin:()=>{},permittedInstitutions:c=>c.admin?['sruti']:[],
 badInstitution:()=>{throw Error('bad institution')},forbid:()=>{throw Error('forbidden')}};
const deps={assertConfigured:()=>{},
 directory:async k=>k==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[{id:'C1',teacherId:'T1'},{id:'C2',teacherId:'T2'}]},
 history:async(k,i,ids)=>({records:[{kind:k,institution:i,assigned:ids?[...ids]:null}]})};
const ctx=(kind,admin=false,inst='sruti',method='GET')=>({parts:['operations',kind],method,claims:{sub:'U',admin},query:{institution:inst}});
for(const kind of ['rsvp','practice']){
 test(`${kind} admin canonical read`,async()=>{
  const result=await finalOperationsRoute(ctx(kind,true),deps,access,env);
  assert.equal(result.status,200);assert.deepEqual(result.body.records[0].assigned,null);
 });
 test(`${kind} teacher assigned-class scope`,async()=>{
  const result=await finalOperationsRoute(ctx(kind),deps,access,env);
  assert.deepEqual(result.body.records[0].assigned,['C1']);
 });
 test(`${kind} unlinked teacher and writes blocked`,async()=>{
  await assert.rejects(finalOperationsRoute(ctx(kind),{...deps,directory:async()=>({linked:false})},access,env),/forbidden/);
  assert.equal(await finalOperationsRoute(ctx(kind,true,'sruti','POST'),deps,access,env),undefined);
  assert.equal(await finalOperationsRoute(ctx(kind,true),deps,access,{SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
 });
}
test('lambda wires canonical history reader before final fallback',()=>{
 const s=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 assert.match(s,/history:finalOperationsHistory\(\)/);
 assert.ok(s.indexOf('finalOperationsRoute(routeContext')<s.indexOf("finalOnlyGate(parts,method,'fallback')"));
});
test('feedback is independently served from canonical feedback storage',async()=>{
 const d={...deps,feedback:{list:async()=>({records:[]})}};
 const result=await finalOperationsRoute(ctx('feedback',true),d,access,env);
 assert.deepEqual(result,{status:200,body:{records:[]}});
});
