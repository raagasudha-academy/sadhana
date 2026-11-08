import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsRoute} from '../src/finalOperations.mjs';
const env={SADHANA_ENTITY_TABLE_SET:'final'};
const ctx=(inst,admin,method='GET')=>({parts:['operations','attendance'],method,claims:{sub:'subject',admin},query:{institution:inst}});
const access={
 view:()=>{},admin:()=>{},
 permittedInstitutions:claims=>claims.admin?['raaga']:[],
 badInstitution:()=>{throw Error('invalid academy');},
 forbid:()=>{throw Error('forbidden');},
};
const calls=[];
const readers={
 assertConfigured:()=>{},
 directory:async type=>type==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[{id:'C1',teacherId:'T1'},{id:'C2',teacherId:'T2'}]},
 attendance:async (...args)=>{calls.push(args);return {records:[{id:'A1'}]};},
};
test('administrator receives canonical attendance for exact institution',async()=>{
 calls.length=0;
 const x=await finalOperationsRoute(ctx('raaga',true),readers,access,env);
 assert.equal(x.status,200);assert.deepEqual(calls,[['raaga']]);
});
test('teacher sees attendance scoped to assigned class',async()=>{
 calls.length=0;
 const x=await finalOperationsRoute(ctx('raaga',false),readers,access,env);
 assert.equal(x.status,200);assert.deepEqual([...calls[0][1]],['C1']);assert.equal(calls[0][2],'T1');
});
test('attendance is not handled on writes or in split mode',async()=>{
 assert.equal(await finalOperationsRoute(ctx('raaga',true,'POST'),readers,access,env),undefined);
 assert.equal(await finalOperationsRoute(ctx('raaga',true),readers,access,{SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
});
test('invalid academy fails before reading attendance',async()=>{
 calls.length=0;await assert.rejects(finalOperationsRoute(ctx('other',true),readers,access,env));
 assert.equal(calls.length,0);
});
test('Lambda wires canonical attendance handler before final-only boundary',()=>{
 const source=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 assert.match(source,/attendance:finalAttendance\(\)/);
 assert.ok(source.indexOf('finalOperationsRoute(routeContext')<source.indexOf("finalOnlyGate(parts,method,'fallback')"));
});
