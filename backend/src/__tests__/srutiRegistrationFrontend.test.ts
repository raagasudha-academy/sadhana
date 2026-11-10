import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10RegistrationCutoverRoutes} from '../routes/registrationCutoverRoutes.ts';

const keys=['M10_REGISTRATION_M9_READS','M95_ONBOARDING_MODE','M91_SRUTI_REVIEW_WRITES'] as const;
async function enabled(fn:()=>Promise<void>){const prior=keys.map(k=>process.env[k]);
 process.env.M10_REGISTRATION_M9_READS='enabled';process.env.M95_ONBOARDING_MODE='enabled';process.env.M91_SRUTI_REVIEW_WRITES='enabled';
 try{await fn();}finally{keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});}}
const sruti={sub:'sruti-admin-sub','cognito:groups':['sruti-admin']};
const raaga={sub:'raaga-admin-sub','cognito:groups':['raagasudha-admin']};
const req=(parts:string[],method:string,inst:string,claims:any=sruti,body='{}')=>({
 parts,method,query:{institution:inst},claims,groups:[],inst,event:{body}
} as any);
const response=(x:any)=>JSON.parse(x.body);

test('Sruti list and detail stay institution-scoped',async()=>enabled(async()=>{
 const route=makeM10RegistrationCutoverRoutes({
  list:async(inst)=>({items:[{registrationId:'sr-1',institutionId:'sruti',source:'sruti-website'},{registrationId:'ra-1',institutionId:'raaga'}],more:false}),
  get:async(id)=>({registrationId:id,institutionId:id.startsWith('sr')?'sruti':'raaga',source:id.startsWith('sr')?'sruti-website':'legacy'})
 });
 const list=await route(req(['website-registrations'],'GET','sruti'));
 assert.equal(list?.statusCode,200);assert.deepEqual(response(list).records.map((v:any)=>v.registrationId),['sr-1']);
 assert.equal((await route(req(['website-registrations','sr-1'],'GET','sruti')))?.statusCode,200);
 await assert.rejects(route(req(['website-registrations','ra-1'],'GET','sruti')),(e:any)=>e.status===404);
 assert.equal(await route(req(['website-registrations'],'GET','raaga',raaga)),undefined);
}));

test('Sruti review uses existing conditional M9 reviewer, never legacy',async()=>enabled(async()=>{
 let called=0;
 const review=async(ctx:any)=>{called++;assert.deepEqual(ctx.parts,['m9-onboarding','sruti-intake','SR-1','review']);assert.equal(ctx.query.institution,'sruti');return {statusCode:200,headers:{},body:JSON.stringify({reviewStatus:'approved'})};};
 const route=makeM10RegistrationCutoverRoutes({list:async()=>({items:[],more:false}),get:async()=>null},review);
 assert.equal((await route(req(['website-registrations','SR-1'],'PATCH','sruti',sruti,JSON.stringify({reviewStatus:'approved',expectedVersion:1}))))?.statusCode,200);
 assert.equal(called,1);
 await assert.rejects(route(req(['website-registrations','SR-1'],'PATCH','raaga',sruti)),(e:any)=>e.status===403);
 assert.equal(called,1);
}));

test('Sruti review is disabled unless separate review flag is enabled',async()=>enabled(async()=>{
 process.env.M91_SRUTI_REVIEW_WRITES='disabled';let called=false;
 const route=makeM10RegistrationCutoverRoutes({list:async()=>({items:[],more:false}),get:async()=>null},async()=>{called=true;return undefined;});
 assert.equal((await route(req(['website-registrations','SR-1'],'PATCH','sruti')))?.statusCode,503);
 assert.equal(called,false);
}));

test('Raaga legacy action never reaches Sruti review',async()=>enabled(async()=>{
 let called=false;
 const route=makeM10RegistrationCutoverRoutes({list:async()=>({items:[],more:false}),get:async()=>null},async()=>{called=true;return undefined;});
 assert.equal(await route(req(['website-registrations','RS-1'],'PATCH','raaga',raaga)),undefined);
 assert.equal(called,false);
}));


test('Sruti intake lists with M10 and M95 cutover flags disabled, while Raaga remains legacy',async()=>enabled(async()=>{
 process.env.M10_REGISTRATION_M9_READS='disabled';
 process.env.M95_ONBOARDING_MODE='disabled';
 const route=makeM10RegistrationCutoverRoutes({
  list:async()=>({items:[
   {registrationId:'SR-2026-4D6401',institutionId:'sruti',source:'sruti-website',reviewStatus:'pending'},
   {registrationId:'RS-1',institutionId:'raaga',source:'raagasudha-website'},
  ],more:false}),
  get:async()=>({registrationId:'SR-2026-4D6401',institutionId:'sruti',source:'sruti-website',version:1,submission:{students:[{firstName:'Test'}]}})
 });
 const listing=await route(req(['website-registrations'],'GET','sruti'));
 assert.equal(listing?.statusCode,200);
 assert.deepEqual(response(listing).records.map((r:any)=>r.registrationId),['SR-2026-4D6401']);
 const detail=await route(req(['website-registrations','SR-2026-4D6401'],'GET','sruti'));
 assert.equal(response(detail).record.submission.students[0].firstName,'Test');
 assert.equal(await route(req(['website-registrations'],'GET','raaga',raaga)),undefined);
 await assert.rejects(route(req(['website-registrations'],'GET','sruti',raaga)),(e:any)=>e.status===403);
 // This test verifies read-only listing while the dedicated review switch is off.
 process.env.M91_SRUTI_REVIEW_WRITES='disabled';
 assert.equal((await route(req(['website-registrations','SR-2026-4D6401'],'PATCH','sruti')))?.statusCode,503);
}));


test('Sruti review works with broad M9 and M10 flags disabled, only dedicated review flag enabled',async()=>enabled(async()=>{
 process.env.M10_REGISTRATION_M9_READS='disabled';
 process.env.M95_ONBOARDING_MODE='disabled';
 let called=0;
 const review=async(ctx:any)=>{called++;assert.equal(ctx.parts[0],'m9-onboarding');return {statusCode:200,headers:{},body:JSON.stringify({reviewStatus:'approved',guardianAccessGranted:false})};};
 const route=makeM10RegistrationCutoverRoutes({list:async()=>({items:[],more:false}),get:async()=>null},review);
 const decision=await route(req(['website-registrations','SR-2026-4D6401'],'PATCH','sruti',sruti,JSON.stringify({reviewStatus:'approved',expectedVersion:1})));
 assert.equal(decision?.statusCode,200);assert.equal(called,1);
 await assert.rejects(route(req(['website-registrations','SR-2026-4D6401'],'PATCH','sruti',raaga)),(e:any)=>e.status===403);
 assert.equal(called,1);
}));

test('Sruti default reviewer rejects invalid decision payload before DynamoDB access',async()=>enabled(async()=>{
 process.env.M95_ONBOARDING_MODE='disabled';
 process.env.M10_REGISTRATION_M9_READS='disabled';
 const route=makeM10RegistrationCutoverRoutes({list:async()=>({items:[],more:false}),get:async()=>null});
 for (const body of [
  JSON.stringify({reviewStatus:'approved',expectedVersion:0}),
  JSON.stringify({reviewStatus:'invalid',expectedVersion:1}),
  JSON.stringify({reviewStatus:'approved',expectedVersion:1,guardianAccessGranted:true}),
  '{}'
 ]) {
  await assert.rejects(route(req(['website-registrations','SR-1'],'PATCH','sruti',sruti,body)),(e:any)=>e.status===400);
 }
}));
