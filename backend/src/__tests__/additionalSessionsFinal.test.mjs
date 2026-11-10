import test from 'node:test';
import assert from 'node:assert/strict';
import {finalSchedulingWriteRoute} from '../finalSchedulingWrites.mjs';
const env={SADHANA_DATA_MODE:'final',SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_CALENDAR_WRITES:'enabled'};
const ctx=(claims={sub:'actor'})=>({parts:['additional-sessions'],method:'POST',claims,query:{institution:'sruti'},event:{body:'{}'}});
const access={view:()=>{},permittedInstitutions:()=>['sruti'],admin:()=>{},viewableInstitutions:()=>['sruti'],deny:()=>{throw Error('denied');}};
test('additional sessions use canonical final service and never legacy handler',async()=>{
 let called=0;
 const dependencies={assertConfigured:()=>{},parse:()=>({classId:'CLASS-TEST1',sessions:[{date:'2026-11-12',startTime:'18:00',endTime:'19:00'}]}),sessions:()=>({createAdditionalSessions:async(...args)=>{called++;assert.equal(args[0],'sruti');assert.equal(args[3],true);return {records:[],count:1};}})};
 const response=await finalSchedulingWriteRoute(ctx(),dependencies,access,env);
 assert.deepEqual(response,{status:201,body:{records:[],count:1}});assert.equal(called,1);
});
test('additional sessions fail closed when final write flag disabled',async()=>{
 const response=await finalSchedulingWriteRoute(ctx(),{},access,{...env,SADHANA_FINAL_CALENDAR_WRITES:'disabled'});
 assert.equal(response.status,503);
});
test('additional sessions reject other methods without writer invocation',async()=>{
 const response=await finalSchedulingWriteRoute({...ctx(),method:'DELETE'}, {}, access, env);
 assert.equal(response.status,405);
});
test('unauthenticated additional-session request returns 401 before configuration or writer access',async()=>{
 let configured=0,written=0;
 const dependencies={assertConfigured:()=>configured++,sessions:()=>({createAdditionalSessions:async()=>{written++;}})};
 const response=await finalSchedulingWriteRoute(ctx(null),dependencies,access,env);
 assert.equal(response.status,401);assert.equal(configured,0);assert.equal(written,0);
});
test('additional sessions deny cross-academy before write',async()=>{
 const response=await finalSchedulingWriteRoute({...ctx(),query:{institution:'wrong'}},{},access,env);
 assert.equal(response.status,400);
});
