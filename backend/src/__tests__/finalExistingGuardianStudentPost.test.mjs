import test from 'node:test';
import assert from 'node:assert/strict';
import {finalCoreIdentityRoute} from '../finalCoreIdentity.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final',SADHANA_FINAL_CORE_WRITES:'enabled'};
const ctx=(body,inst='raaga',sub='administrator')=>({parts:['operations','student'],method:'POST',query:{institution:inst},inst,claims:{sub},event:{body:JSON.stringify(body)}});
const calls=[];
const deps={assertConfigured:()=>calls.push('tables'),parse:e=>JSON.parse(e.body),core:()=>({
 create:async(...args)=>{calls.push(['create',...args]);return {id:'PERSON-NEW',rollNumber:'RS-007'};},
 registerExistingGuardianAsStudent:async(...args)=>{calls.push(['existing',...args]);return {id:'PERSON-MOHANA',rollNumber:'RS-007'};}
})};
const access={admin:(_claims,inst)=>{if(inst!=='raaga')throw Object.assign(Error('No academy admin access'),{status:403});}};
test('new adult routes only to canonical independent creation',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({name:'New Adult',email:'person@example.org',phone:'+447700900001',familyId:'',adultConfirmed:true}),deps,access,env);
 assert.equal(r.status,201);assert.equal(r.body.record.id,'PERSON-NEW');
 assert.deepEqual(calls[1][1], 'students');
 assert.equal(calls[1][4].registrationType,'independent');
});
test('existing parent requires explicit existing-primary-guardian selection',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({existingPersonRole:'primary_guardian',familyId:'fam_123456',relationship:'parent_guardian'}),deps,access,env);
 assert.equal(r.status,201);assert.equal(calls[1][0],'existing');
});
test('parent details without existing selector cannot create duplicate',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({name:'Existing Parent',familyId:'fam_123456',relationship:'parent_guardian'}),deps,access,env);
 assert.equal(r.status,409);assert.deepEqual(calls,[]);
});
test('no adult confirmation no write',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({name:'New Adult',familyId:''}),deps,access,env);
 assert.equal(r.status,400);assert.deepEqual(calls,[]);
});
test('disabled write flag no calls',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({existingPersonRole:'primary_guardian',familyId:'fam_123456',relationship:'parent_guardian'}),deps,access,{...env,SADHANA_FINAL_CORE_WRITES:''});
 assert.equal(r.status,503);assert.deepEqual(calls,[]);
});
test('wrong academy is denied before service call',async()=>{
 calls.length=0;
 await assert.rejects(finalCoreIdentityRoute(ctx({name:'New Adult',familyId:'',adultConfirmed:true},'sruti'),deps,access,env),{status:403});
 assert.deepEqual(calls,[]);
});

test('new family child is validated and routed with existing family',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({name:'Child Test',familyId:'fam_123456',relationship:'child'}),deps,access,env);
 assert.equal(r.status,201); assert.equal(calls[1][4].registrationType,'family');
 assert.equal(calls[1][4].familyId,'fam_123456');
});

test('malicious existing person payload cannot alter name, email or role',async()=>{
 calls.length=0;
 const r=await finalCoreIdentityRoute(ctx({existingPersonRole:'primary_guardian',familyId:'fam_123456',relationship:'parent_guardian',name:'Someone Else'}),deps,access,env);
 assert.equal(r.status,400);assert.deepEqual(calls,[]);
});
