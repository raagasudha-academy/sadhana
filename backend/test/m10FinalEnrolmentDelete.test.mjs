import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsEnrolmentWriteRoute as route} from '../src/m10FinalOperationsEnrolmentWrite.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_DATA_MODE:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_CORE_WRITES:'enabled'};
function ctx(method='DELETE',inst='sruti',id='ENROLMENT-1234'){
 return {parts:['operations','enrolment',id],method,claims:{sub:'admin'},query:{institution:inst},event:{}};
}
function setup(body={confirm:'DELETE',expectedVersion:1}){
 const calls=[];
 const dependencies={assertConfigured(){},parse(){return body;},core(){return {
   async endEnrolment(...args){calls.push(args);return {deleted:true,enrolmentId:args[2]};},
   async create(...args){calls.push(args);return {id:'ENROLMENT-NEW'};}
 };}};
 return {calls,dependencies,access:{admin(_,inst){if(inst!=='sruti')throw Error('forbidden');}}};
}
test('DELETE routes to canonical ending with institution, claim, id and version',async()=>{
 const d=setup();const response=await route(ctx(),d.dependencies,d.access,env);
 assert.equal(response.status,200);assert.deepEqual(response.body,{deleted:true,enrolmentId:'ENROLMENT-1234'});
 assert.equal(d.calls.length,1);assert.equal(d.calls[0][0],'sruti');assert.equal(d.calls[0][2],'ENROLMENT-1234');
 assert.equal(d.calls[0][3].expectedVersion,1);
});
test('DELETE refuses another academy before write',async()=>{
 const d=setup();await assert.rejects(route(ctx('DELETE','raaga'),d.dependencies,d.access,env),/forbidden/);
 assert.equal(d.calls.length,0);
});
test('DELETE refuses missing feature flag and split mode',async()=>{
 const d=setup();const a=await route(ctx(),d.dependencies,d.access,{...env,SADHANA_FINAL_CORE_WRITES:'disabled'});
 assert.equal(a.status,503);assert.equal(d.calls.length,0);
 const b=await route(ctx(),d.dependencies,d.access,{...env,SADHANA_DATA_MODE:'split'});
 assert.equal(b.status,503);assert.equal(d.calls.length,0);
});
test('DELETE rejects nested or malformed routes',async()=>{
 const d=setup();const a=await route(ctx('DELETE','sruti','bad space'),d.dependencies,d.access,env);
 assert.equal(a.status,405);assert.equal(d.calls.length,0);
});
test('existing POST remains supported',async()=>{
 const d=setup({studentId:'s',classId:'c',startDate:'2026-11-07'});
 const response=await route({parts:['operations','enrolment'],method:'POST',claims:{sub:'admin'},query:{institution:'sruti'},event:{}},d.dependencies,d.access,env);
 assert.equal(response.status,201);assert.equal(d.calls[0][0],'enrolments');
});
test('canonical removal archives rather than deleting historical enrolment',()=>{
 const text=readFileSync(new URL('../src/m10CoreWriteService.ts',import.meta.url),'utf8');
 assert.match(text,/async endEnrolment\(/);
 assert.match(text,/status:'archived'/);
 assert.match(text,/ACADEMY_ENROLMENT_ENDED/);
 assert.match(text,/ConditionExpression:'#e=:id'/);
 assert.match(text,/legacyPayload:\{\.\.\.prior,archived:true/);
});
