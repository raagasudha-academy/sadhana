import test from 'node:test';
import assert from 'node:assert/strict';
import {finalRaagaIntakeRoute} from '../src/m10FinalRaagaIntake.mjs';
import {prepareWebsiteImport} from '../src/m95WebsiteImportCore.mjs';

const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_RAAGA_IMPORT_PREVIEW:'enabled',SADHANA_FINAL_RAAGA_IMPORT_WRITES:'enabled',SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES:'enabled',SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED:'enabled'};
const context=(action='import',body={preview:false,confirmReference:'RS-777'})=>({parts:['website-registrations','RS-777',action],method:'POST',claims:{sub:'verified-admin'},query:{institution:'raaga'},inst:'raaga',event:{body:JSON.stringify(body)}});
const harness=()=>{const calls=[];return {calls,deps:{parse:e=>JSON.parse(e.body),assertConfigured:()=>calls.push('config'),execute:async (id,c)=>(calls.push(['execute',id,c.sub]),{imported:true,registrationId:'marker',externalSyncPending:true}),preview:async (id,c)=>(calls.push(['preview',id,c.sub]),{preview:true}),sync:async(id,c)=>(calls.push(['sync',id,c.sub]),{websiteSyncStatus:'synced'})}};};

test('final import requires both explicit write and identity reconciliation flags',async()=>{
 for(const k of ['SADHANA_FINAL_RAAGA_IMPORT_WRITES','SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED']){
  const {calls,deps}=harness();const result=await finalRaagaIntakeRoute(context(),deps,{...env,[k]:'disabled'});
  assert.equal(result.status,503);assert.deepEqual(calls,[]);
 }
});
test('no import when live split mode even with every permission enabled',async()=>{
 const {calls,deps}=harness();const result=await finalRaagaIntakeRoute(context(),deps,{...env,SADHANA_DATA_MODE:'split'});
 assert.equal(result.status,503);assert.deepEqual(calls,[]);
});
test('exact reference confirmation and fresh-only shape prevent legacy silent family creation',async()=>{
 for(const body of [{preview:false},{preview:false,confirmReference:'RS-778'},{linkFamilyId:'family1',preview:false,confirmReference:'RS-777'},{}]){
  const {calls,deps}=harness();const result=await finalRaagaIntakeRoute(context('import',body),deps,env);
  assert.equal(result.status,503);assert.deepEqual(calls,[]);
 }
});
test('verified fresh import calls canonical transaction service with authenticated actor only',async()=>{
 const {calls,deps}=harness();const result=await finalRaagaIntakeRoute(context(),deps,env);
 assert.equal(result.status,200);assert.equal(result.body.imported,true);
 assert.equal(result.body.guardianAccessGranted,false);assert.equal(result.body.invitationSent,false);
 assert.deepEqual(calls,['config',['execute','RS-777','verified-admin']]);
});
test('a standard POST cannot execute a write, and previews remain read-only',async()=>{
 const {calls,deps}=harness();const preview=await finalRaagaIntakeRoute(context('import',{preview:true}),deps,env);
 assert.equal(preview.status,200);assert.deepEqual(calls,['config',['preview','RS-777','verified-admin']]);
});
test('sync requires its own gate and reference confirmation',async()=>{
 const {calls,deps}=harness();let result=await finalRaagaIntakeRoute(context('sync',{confirmReference:'RS-777'}),deps,{...env,SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES:'disabled'});
 assert.equal(result.status,503);assert.deepEqual(calls,[]);
 result=await finalRaagaIntakeRoute(context('sync',{confirmReference:'RS-778'}),deps,env);
 assert.equal(result.status,400);assert.deepEqual(calls,[]);
 result=await finalRaagaIntakeRoute(context('sync',{confirmReference:'RS-777'}),deps,env);
 assert.equal(result.status,200);assert.deepEqual(calls,['config',['sync','RS-777','verified-admin']]);
});
test('planner rejects prior imported website reference rather than allocating duplicate students',()=>{
 const approved={registrationId:'RS-777',institution:'raaga',reviewStatus:'approved',sadhanaImport:{status:'imported',familyId:'legacy-1'},people:[],students:[]};
 assert.throws(()=>prepareWebsiteImport(approved,'raaga','admin',{family:0,student:0}),/prior import/);
});
