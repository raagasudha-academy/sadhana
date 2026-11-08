import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM9Routes} from '../src/routes/routes.ts';
import type {RouteContext} from '../src/routes/http.ts';
const makeContext=(parts:string[],method='GET',institution='raaga',groups=['raagasudha-admin']):RouteContext=>({
 parts,method,query:{institution},inst:'raaga',groups:['raaga'],
 claims:{sub:'verified-sub','cognito:groups':groups},event:{}
});
const response=(value:unknown)=>JSON.parse((value as {body:string}).body);
function fakeReader(){
 const calls:any[]=[];
 const reader={
 async get(entity:string,id:string){calls.push(['get',entity,id]);return {classId:id,institutionId:'sruti'};},
 async queryIndex(entity:string,index:string,inst:string,limit:number){calls.push(['query',entity,index,inst,limit]);return {items:[{classId:'c1',institutionId:'raaga'},{classId:'c2',institutionId:'sruti'}],lastEvaluatedKey:null};}
 };
 return {reader,calls};
}
test('M9 route is closed by default and never calls DynamoDB',async()=>{
 delete process.env.M9_API_ENABLED;
 const {reader,calls}=fakeReader();const r=await makeM9Routes(()=>reader as any)(makeContext(['m9','list','classes']));
 assert.equal((r as any).statusCode,404);assert.equal(calls.length,0);
});
test('requires verified admin JWT group and does not permit viewer',async()=>{
 process.env.M9_API_ENABLED='read-only';
 const {reader,calls}=fakeReader();await assert.rejects(()=>makeM9Routes(()=>reader as any)(makeContext(['m9','list','classes'],'GET','raaga',['raagasudha-viewer'])),/Administrator access required/);assert.equal(calls.length,0);
 delete process.env.M9_API_ENABLED;
});
test('requires matching institution group before reading',async()=>{
 process.env.M9_API_ENABLED='read-only';
 const {reader,calls}=fakeReader();await assert.rejects(()=>makeM9Routes(()=>reader as any)(makeContext(['m9','list','classes'],'GET','sruti')),/Administrator access required/);
 assert.equal(calls.length,0);delete process.env.M9_API_ENABLED;
});
test('lists only institution partition and filters results defensively',async()=>{
 process.env.M9_API_ENABLED='read-only';
 const {reader,calls}=fakeReader();const result=await makeM9Routes(()=>reader as any)(makeContext(['m9','list','classes']));
 assert.equal((result as any).statusCode,200);assert.equal(response(result).records.length,1);
 assert.deepEqual(calls,[['query','classes','InstitutionClassesIndex','raaga',50]]);
 delete process.env.M9_API_ENABLED;
});
test('record reads never reveal another institution and POST/PATCH writes stay blocked',async()=>{
 process.env.M9_API_ENABLED='read-only';
 const {reader,calls}=fakeReader();const route=makeM9Routes(()=>reader as any);
 const r=await route(makeContext(['m9','record','classes','c2']));assert.equal((r as any).statusCode,404);
 const post=await route(makeContext(['m9','record','classes','c2'],'POST'));assert.equal((post as any).statusCode,405);
 const patch=await route(makeContext(['m9','record','classes','c2'],'PATCH'));assert.equal((patch as any).statusCode,405);
 assert.equal(calls.length,1);delete process.env.M9_API_ENABLED;
});
test('status reports explicitly read-only integration',async()=>{
 process.env.M9_API_ENABLED='read-only';
 const {reader}=fakeReader();const r=await makeM9Routes(()=>reader as any)(makeContext(['m9','status']));
 assert.deepEqual(response(r),{mode:'read-only',cutover:false,tableCount:18});delete process.env.M9_API_ENABLED;
});
