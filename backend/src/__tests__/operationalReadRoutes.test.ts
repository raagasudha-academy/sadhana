import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10OperationalReadRoutes} from '../routes/operationalReadRoutes.ts';
import type {RouteContext} from '../routes/http.ts';
const build=(parts:string[],inst='raaga',groups=['raagasudha-admin'],method='GET',query:Record<string,string>={}):RouteContext=>({parts,method,inst:inst as any,query,groups:[inst as any],claims:{sub:'admin','cognito:groups':groups},event:{}});
const mock={audit:async()=>({records:[{id:'AUDIT-1'}],more:false}),practice:async()=>({records:[{id:'PRACTICE-1'}],more:false})};
const route=makeM10OperationalReadRoutes(mock);
async function withFlags(fn:()=>Promise<void>){const a=process.env.M10_OPERATIONAL_M9_READS,b=process.env.M9_TARGET_REPOSITORY_ENABLED;process.env.M10_OPERATIONAL_M9_READS='enabled';process.env.M9_TARGET_REPOSITORY_ENABLED='read-only';try{await fn();}finally{if(a===undefined)delete process.env.M10_OPERATIONAL_M9_READS;else process.env.M10_OPERATIONAL_M9_READS=a;if(b===undefined)delete process.env.M9_TARGET_REPOSITORY_ENABLED;else process.env.M9_TARGET_REPOSITORY_ENABLED=b;}}
test('M9 operational route defaults off',async()=>{const prev=process.env.M10_OPERATIONAL_M9_READS;delete process.env.M10_OPERATIONAL_M9_READS;try{assert.equal(await route(build(['audit'])),undefined);}finally{if(prev!==undefined)process.env.M10_OPERATIONAL_M9_READS=prev;}});
test('audit read uses M9 and preserves records response',()=>withFlags(async()=>{const result=await route(build(['audit']));assert.equal(result?.statusCode,200);assert.deepEqual(JSON.parse(result!.body),{records:[{id:'AUDIT-1'}],more:false});}));
test('practice history read uses M9 and student filter',()=>withFlags(async()=>{const result=await route(build(['practice'],'sruti',['sruti-admin'],'GET',{studentId:'PERSON-123'}));assert.equal(result?.statusCode,200);assert.equal(JSON.parse(result!.body).records[0].id,'PRACTICE-1');}));
test('cross-academy administrator denied',()=>withFlags(async()=>{await assert.rejects(route(build(['audit'],'raaga',['sruti-admin'])),(e:any)=>e.status===403);}));
test('practice requires a valid student id',()=>withFlags(async()=>{await assert.rejects(route(build(['practice'])),(e:any)=>e.status===400);}));
test('operational writes never fall back to old repository',()=>withFlags(async()=>{const result=await route(build(['practice'],'raaga',['raagasudha-admin'],'POST'));assert.equal(result?.statusCode,503);}));
test('M9 reader opt-in is independent',()=>withFlags(async()=>{process.env.M9_TARGET_REPOSITORY_ENABLED='disabled';const result=await route(build(['audit']));assert.equal(result?.statusCode,503);}));
