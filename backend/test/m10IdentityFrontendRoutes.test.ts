import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10IdentityFrontendRoutes} from '../src/routes/m10IdentityFrontendRoutes.ts';

const envKeys=['M10_GUARDIAN_FRONTEND_M9','M10_RAAGA_IMPORT_FRONTEND_M9','M95_ONBOARDING_MODE'];
async function flags(values:Record<string,string>,fn:()=>Promise<void>){
 const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 try{for(const k of envKeys){if(k in values)process.env[k]=values[k];else delete process.env[k];}await fn();}
 finally{for(const k of envKeys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}
const ctx=(parts:string[],method:string,inst='raaga',body:unknown={},groups=['raagasudha-admin'])=>({
 parts,method,inst,query:{institution:inst},claims:{sub:'test-sub','cognito:groups':groups},groups,
 event:{body:JSON.stringify(body),isBase64Encoded:false}
} as any);

test('default flags do not claim legacy frontend paths',async()=>{
 await flags({},async()=>{
  const route=makeM10IdentityFrontendRoutes();
  assert.equal(await route(ctx(['family-access','request'],'POST')),undefined);
  assert.equal(await route(ctx(['website-registrations','RS-example','import'],'POST')),undefined);
 });
});
test('guardian request creates pending evidence through M9 service only',async()=>{
 await flags({M10_GUARDIAN_FRONTEND_M9:'enabled',M95_ONBOARDING_MODE:'enabled'},async()=>{
  let called=0;
  const route=makeM10IdentityFrontendRoutes(()=>({request:async(inst,claims,body)=>{
   called++;assert.equal(inst,'raaga');assert.equal(claims.sub,'test-sub');assert.equal(body.studentId,'PERSON-1');
   return {status:'pending',submitted:true};
  },decide:async()=>{throw Error('not called');}}) as any);
  const response=await route(ctx(['family-access','request'],'POST','raaga',{studentId:'PERSON-1'}));
  assert.equal(response?.statusCode,201);assert.equal(JSON.parse(response!.body).status,'pending');assert.equal(called,1);
 });
});
test('unsupported guardian actions never fall through to legacy',async()=>{
 await flags({M10_GUARDIAN_FRONTEND_M9:'enabled',M95_ONBOARDING_MODE:'enabled'},async()=>{
  const route=makeM10IdentityFrontendRoutes();
  assert.equal((await route(ctx(['family-access','mine'],'GET')))?.statusCode,503);
 });
});
test('Raagasudha M9 import preview uses existing importer without executing',async()=>{
 await flags({M10_RAAGA_IMPORT_FRONTEND_M9:'enabled',M95_ONBOARDING_MODE:'enabled'},async()=>{
  let called=0;
  const importer=async(inst:string,claims:any,id:string,execute:boolean)=>{
   called++;assert.equal(inst,'raaga');assert.equal(id,'RS-example');assert.equal(execute,false);
   return {preview:true,readyForExecute:true};
  };
  const route=makeM10IdentityFrontendRoutes(undefined,importer as any);
  const response=await route(ctx(['website-registrations','RS-example','import'],'POST','raaga',{preview:true}));
  assert.equal(response?.statusCode,200);assert.equal(called,1);
  assert.equal(JSON.parse(response!.body).guardianAccessGranted,false);
 });
});
test('legacy identity corrections and revocation never reach importer',async()=>{
 await flags({M10_RAAGA_IMPORT_FRONTEND_M9:'enabled',M95_ONBOARDING_MODE:'enabled'},async()=>{
  let called=false;
  const route=makeM10IdentityFrontendRoutes(undefined,(async()=>{called=true;return {};}) as any);
  await assert.rejects(()=>route(ctx(['website-registrations','RS-example','import'],'POST','raaga',{identityCorrection:{}})),{status:400});
  assert.equal((await route(ctx(['website-registrations','RS-example','revoke'],'POST')))?.statusCode,503);
  assert.equal(called,false);
 });
});
test('cross-institution import denied before any data operation',async()=>{
 await flags({M10_RAAGA_IMPORT_FRONTEND_M9:'enabled',M95_ONBOARDING_MODE:'enabled'},async()=>{
  let called=false;
  const route=makeM10IdentityFrontendRoutes(undefined,(async()=>{called=true;return {};}) as any);
  await assert.rejects(()=>route(ctx(['website-registrations','RS-example','import'],'POST','raaga',{preview:true},['sruti-admin'])),{status:403});
  assert.equal(called,false);
 });
});

test('Sruti registration routes bypass the Raagasudha import adapter',async()=>{
 await flags({M10_RAAGA_IMPORT_FRONTEND_M9:'enabled',M95_ONBOARDING_MODE:'enabled'},async()=>{
  const route=makeM10IdentityFrontendRoutes();
  assert.equal(await route(ctx(['website-registrations'],'GET','sruti',{},['sruti-admin'])),undefined);
  assert.equal(await route(ctx(['website-registrations','SR-1'],'PATCH','sruti',{},['sruti-admin'])),undefined);
  assert.equal((await route(ctx(['website-registrations','RS-1','revoke'],'POST')))?.statusCode,503);
 });
});
