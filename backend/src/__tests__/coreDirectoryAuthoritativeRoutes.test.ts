import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10CoreDirectoryAuthoritativeRoutes} from '../routes/coreDirectoryAuthoritativeRoutes.ts';

const admin={sub:'admin','cognito:groups':'raagasudha-admin'};
const other={sub:'sruti-admin','cognito:groups':'sruti-admin'};
const base:any={parts:['students'],method:'GET',inst:'raaga',query:{institution:'raaga'},claims:admin,event:{},groups:['raaga']};
const keys=['M10_CORE_DIRECTORY_ROUTING','M9_TARGET_REPOSITORY_ENABLED'] as const;
async function withFlags(fn:()=>Promise<void>){
 const prior=keys.map(k=>process.env[k]);
 try {process.env.M10_CORE_DIRECTORY_ROUTING='enabled';process.env.M9_TARGET_REPOSITORY_ENABLED='read-only';await fn();}
 finally {keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);}
}
test('frontend core directory GET uses M9 only, preserves legacy envelope',async()=>withFlags(async()=>{
 const calls:string[]=[];
 const route=makeM10CoreDirectoryAuthoritativeRoutes(()=>({list:async(entity:any,inst:any)=>{
  calls.push(`${entity}:${inst}`);return {records:[{id:'ST-1',name:'A'}],more:false};
 }} as any));
 const result=await route(base);
 assert.equal(result?.statusCode,200);
 assert.deepEqual(JSON.parse(result!.body),{records:[{id:'ST-1',name:'A'}],more:false});
 assert.deepEqual(calls,['students:raaga']);
 await route({...base,parts:['families']});
 await route({...base,parts:['enrolments']});
 assert.deepEqual(calls,['students:raaga','families:raaga','enrolments:raaga']);
}));
test('unauthorized academy cannot read core directory',async()=>withFlags(async()=>{
 let accessed=false;
 const route=makeM10CoreDirectoryAuthoritativeRoutes(()=>({list:async()=>{accessed=true;return {records:[],more:false};}} as any));
 await assert.rejects(()=>route({...base,claims:other}),(err:any)=>err.status===403);
 assert.equal(accessed,false);
}));
test('activated frontend directory rejects writes rather than fall through',async()=>withFlags(async()=>{
 const route=makeM10CoreDirectoryAuthoritativeRoutes(()=>({list:async()=>{throw Error('should not read');}} as any));
 for(const method of ['POST','PATCH','DELETE']){
  const response=await route({...base,method});
  assert.equal(response?.statusCode,503);
 }
}));
test('disabled flag returns control; missing reader flag fails closed',async()=>{
 const prior=keys.map(k=>process.env[k]);
 try{
  delete process.env.M10_CORE_DIRECTORY_ROUTING;
  const route=makeM10CoreDirectoryAuthoritativeRoutes(()=>({list:async()=>{throw Error('called');}} as any));
  assert.equal(await route(base),undefined);
  process.env.M10_CORE_DIRECTORY_ROUTING='enabled';
  delete process.env.M9_TARGET_REPOSITORY_ENABLED;
  assert.equal((await route(base))?.statusCode,503);
 }finally{keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);}
});
test('projection error never falls back to legacy',async()=>withFlags(async()=>{
 const route=makeM10CoreDirectoryAuthoritativeRoutes(()=>({list:async()=>{throw Error('M10_FAMILY_CONTACT_JOIN_REQUIRED');}} as any));
 await assert.rejects(()=>route({...base,parts:['families']}),/M10_FAMILY_CONTACT_JOIN_REQUIRED/);
}));
