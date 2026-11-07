import test from 'node:test';
import assert from 'node:assert/strict';
import {finalRegistrationRoute} from '../src/m10FinalRegistration.mjs';

const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_DATA_MODE:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',
 SADHANA_FINAL_SRUTI_INGRESS_READY:'enabled',SADHANA_FINAL_SRUTI_REGISTRATION_READS:'enabled'};
const mk=(action='import-execute',body={})=>({parts:['website-registrations','SR-2026-4D6401',action],method:'POST',
 query:{institution:'sruti'},inst:'sruti',claims:{sub:'verified-subject'},event:{body:JSON.stringify(body)}});
const deps=()=>({assertConfigured(){},parse:e=>JSON.parse(e.body||'{}'),
 existingImport:async(ref,sub,data,execute)=>({ref,sub,data,execute}),
 registration:async()=>({statusCode:200,body:JSON.stringify({legacyPreview:true})})});
const access={admin() {}};
test('existing import execute is independently disabled by default',async()=>{
 const r=await finalRegistrationRoute(mk('import-execute',{mode:'existing'}),deps(),access,env);
 assert.equal(r.status,503);assert.match(r.body.error,/disabled/i);
});
test('fresh execute stays blocked even if existing-identity write flag is on',async()=>{
 const r=await finalRegistrationRoute(mk('import-execute',{confirmReference:'SR-2026-4D6401'}),deps(),access,
  {...env,SADHANA_FINAL_SRUTI_EXISTING_IMPORT_WRITES:'enabled'});
 assert.equal(r.status,409);
});
test('legacy preview cannot claim ready-to-execute for an existing family',async()=>{
 const r=await finalRegistrationRoute(mk('import-preview',{}),deps(),access,env);
 assert.equal(r.status,200);assert.equal(r.body.readyForExecute,false);
 assert.equal(r.body.requiresIdentityMapping,true);
});
test('existing import preview strips mode and invokes only canonical importer',async()=>{
 const body={mode:'existing',confirmReference:'SR-2026-4D6401',guardianPersonId:'person_abc',students:[],evidenceReference:'verified:123'};
 const r=await finalRegistrationRoute(mk('import-preview',body),deps(),access,env);
 assert.equal(r.status,200);assert.equal(r.body.execute,false);assert.equal(r.body.ref,'SR-2026-4D6401');
 assert.equal(r.body.data.mode,undefined);assert.equal(r.body.data.guardianPersonId,'person_abc');
});
test('existing import execution passes verified subject only when explicitly enabled',async()=>{
 const r=await finalRegistrationRoute(mk('import-execute',{mode:'existing',confirmReference:'SR-2026-4D6401'}),deps(),access,
  {...env,SADHANA_FINAL_SRUTI_EXISTING_IMPORT_WRITES:'enabled'});
 assert.equal(r.status,200);assert.equal(r.body.execute,true);assert.equal(r.body.sub,'verified-subject');
});
test('Sruti-only operator cannot execute Raaga route',async()=>{
 let invoked=false;
 const r=await finalRegistrationRoute({...mk(),query:{institution:'raaga'}},{...deps(),raaga:()=>{invoked=true;return {status:200}}},
 {admin(){throw Object.assign(new Error('Forbidden'),{status:403})}},env).catch(e=>e);
 assert.equal(r.status,403);assert.equal(invoked,false);
});
test('split mode cannot execute existing importer',async()=>{
 const r=await finalRegistrationRoute(mk(),deps(),access,{...env,SADHANA_DATA_MODE:'split'});
 assert.equal(r.status,503);
});
test('unrecognised registration operation stays blocked',async()=>{
 const r=await finalRegistrationRoute(mk('revoke'),deps(),access,env);
 assert.equal(r.status,503);
});
