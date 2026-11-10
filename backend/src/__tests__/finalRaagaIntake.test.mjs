import test from 'node:test';
import assert from 'node:assert/strict';
import {finalRaagaIntakeRoute} from '../finalRaagaIntake.mjs';
import {finalRegistrationRoute} from '../finalRegistration.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_RAAGA_INTAKE_READS:'enabled',SADHANA_FINAL_RAAGA_REVIEW_WRITES:'enabled',SADHANA_FINAL_RAAGA_IMPORT_PREVIEW:'enabled'};
const base={parts:['website-registrations'],method:'GET',claims:{sub:'sub'},query:{institution:'raaga'},inst:'raaga',event:{body:''}};
function harness(){
 const calls=[];const deps={assertConfigured:()=>calls.push('configured'),parse:e=>JSON.parse(e.body||'{}'),list:async f=>(calls.push(['list',f]),{items:[]}),get:async id=>(calls.push(['get',id]),{registrationId:id}),photo:async(id,p)=>(calls.push(['photo',id,p]),{url:'signed'}),review:async(id,decision,actor)=>(calls.push(['review',id,decision,actor]),{ok:true}),preview:async(id,c)=>(calls.push(['preview',id,c.sub]),{preview:true})};return {calls,deps};
}
test('normal split/M9 mode is never intercepted',async()=>{
 const {deps,calls}=harness();assert.equal(await finalRegistrationRoute(base,{assertConfigured:()=>{},registration:async()=>{},raaga:c=>finalRaagaIntakeRoute(c,deps)}, {admin:()=>{}}, {...env,SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);assert.equal(calls.length,0);
});
test('Raagasudha staff admin must be authorised before external API call',async()=>{
 const {deps,calls}=harness();await assert.rejects(()=>finalRegistrationRoute(base,{registration:async()=>{},raaga:c=>finalRaagaIntakeRoute(c,deps)}, {admin:()=>{throw Error('Denied')}} ,env),/Denied/);assert.equal(calls.length,0);
});
test('Raagasudha read uses isolated gateway, only scoped filters',async()=>{
 const {deps,calls}=harness();const result=await finalRegistrationRoute({...base,query:{institution:'raaga',status:'pending',extraneous:'evil'}},{registration:async()=>{throw Error('Sruti route used')},raaga:c=>finalRaagaIntakeRoute(c,deps,env)},{admin:()=>{}},env);assert.equal(result.status,200);assert.deepEqual(calls[1],['list',{status:'pending'}]);
});
test('missing read flag blocks without external call',async()=>{
 const {deps,calls}=harness();const out=await finalRaagaIntakeRoute(base,deps,{...env,SADHANA_FINAL_RAAGA_INTAKE_READS:'disabled'});assert.equal(out.status,503);assert.equal(calls.length,0);
});
test('read detail/photo requires valid registration and person ID',async()=>{
 const {deps,calls}=harness();assert.equal((await finalRaagaIntakeRoute({...base,parts:['website-registrations','RS-42']},deps,env)).status,200);assert.equal((await finalRaagaIntakeRoute({...base,parts:['website-registrations','RS-42','photos','person-4']},deps,env)).status,200);assert.equal((await finalRaagaIntakeRoute({...base,parts:['website-registrations','../../']},deps,env)).status,405);assert.equal(calls.length,4);
});
test('review accepts only approved/discarded, uses JWT subject',async()=>{
 const {deps,calls}=harness();const out=await finalRaagaIntakeRoute({...base,method:'PATCH',parts:['website-registrations','RS-42'],event:{body:'{"reviewStatus":"approved"}'}},deps,env);assert.equal(out.status,200);assert.deepEqual(calls[1],['review','RS-42','approved','sub']);const denied=await finalRaagaIntakeRoute({...base,method:'PATCH',parts:['website-registrations','RS-42'],event:{body:'{"reviewStatus":"approved","reviewer":"other"}'}},deps,env);assert.equal(denied.status,400);
});
test('import previews are read-only, execution requires exact reference confirmation',async()=>{
 const {deps,calls}=harness();const route={...base,method:'POST',parts:['website-registrations','RS-42','import']};assert.equal((await finalRaagaIntakeRoute({...route,event:{body:'{"preview":true}'}},deps,env)).status,200);assert.deepEqual(calls[1],['preview','RS-42','sub']);assert.equal((await finalRaagaIntakeRoute({...route,event:{body:'{"preview":false}'}},deps,env)).status,400);assert.equal((await finalRaagaIntakeRoute({...route,event:{body:'{}'}},deps,env)).status,400);assert.equal(calls.length,2);
});
test('no legacy fallback or unapproved operation',async()=>{
 const {deps,calls}=harness();const r=await finalRaagaIntakeRoute({...base,parts:['website-registrations','RS-42','provision-parent'],method:'POST'},deps,env);assert.equal(r.status,503);assert.equal(calls.length,0);
 for(const [method,action] of [['GET','revoke-preview'],['POST','revoke'],['POST','revoke-cancel']]){
  const blocked=await finalRaagaIntakeRoute({...base,method,parts:['website-registrations','RS-42',action]},deps,env);
  assert.equal(blocked.status,405,`${method} ${action} remains unsupported`);
 }
 assert.equal(calls.length,0);
});
