import test from 'node:test';
import assert from 'node:assert/strict';
import {m10LearningCutoverRoutes} from '../routes/learningCutoverRoutes.ts';
import {makeM10RegistrationCutoverRoutes} from '../routes/registrationCutoverRoutes.ts';
import type {RouteContext} from '../routes/http.ts';

const ctx=(
  parts:string[],
  method='GET',
  inst='raaga',
  groups=['raagasudha-admin'],
  query:Record<string,string>={}
):RouteContext=>({
  parts,method,inst:inst as any,query,
  claims:{sub:'admin-test','cognito:groups':groups},
  groups:[inst as any],event:{body:'{}'}
});
const body=(r:any)=>JSON.parse(r.body);
const env=async(key:string,value:string,fn:()=>Promise<void>)=>{
  const previous=process.env[key];
  process.env[key]=value;
  try{await fn();}
  finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
};

// The M10 learning migration is independent of the registration migration.
test('learning guard defaults off',async()=>{
  assert.equal(await m10LearningCutoverRoutes(ctx(['teacher-practice','x','comments'])),undefined);
});
test('learning legacy extras fail closed when enabled',async()=>env('M10_LEARNING_NO_LEGACY','enabled',async()=>{
  for(const path of [
    ['teacher-practice','x','comments'],
    ['learner','student-1','extras'],
    ['homework','class-1','materials','id','links']
  ]){
    const result=await m10LearningCutoverRoutes(ctx(path));
    assert.equal(result?.statusCode,503);
    assert.match(body(result).error,/No legacy database fallback/);
  }
}));

test('Raagasudha registration requests still delegate to the legacy handler',async()=>{
  let touched=false;
  const route=makeM10RegistrationCutoverRoutes({
    list:async()=>{touched=true;return {items:[],more:false};},
    get:async()=>{touched=true;return null;}
  });
  assert.equal(await route(ctx(['website-registrations'])),undefined);
  assert.equal(await route(ctx(['website-registrations','RS-ONE'],'PATCH')),undefined);
  assert.equal(touched,false);
});

test('Sruti M9 registration list and detail enforce institution and source isolation',async()=>
  env('M10_REGISTRATION_M9_READS','disabled',()=>env('M95_ONBOARDING_MODE','disabled',async()=>{
    const route=makeM10RegistrationCutoverRoutes({
      list:async()=>({items:[
        {institutionId:'sruti',source:'sruti-website',registrationId:'SR-ONE',reviewStatus:'pending'},
        {institutionId:'raaga',source:'raagasudha-website',registrationId:'RS-ONE'},
        {institutionId:'sruti',source:'other-source',registrationId:'SR-OTHER'}
      ],more:false}),
      get:async(id)=>({
        institutionId:id==='RS-ONE'?'raaga':'sruti',
        source:id==='SR-OTHER'?'other-source':'sruti-website',
        registrationId:id,reviewStatus:'pending'
      })
    });
    const srutiQuery={institution:'sruti'};
    const listed=await route(ctx(['website-registrations'],'GET','sruti',['sruti-admin'],srutiQuery));
    assert.equal(listed?.statusCode,200);
    assert.deepEqual(body(listed).records.map((row:any)=>row.registrationId),['SR-ONE']);
    const found=await route(ctx(['website-registrations','SR-ONE'],'GET','sruti',['sruti-admin'],srutiQuery));
    assert.equal(found?.statusCode,200);
    assert.equal(body(found).record.registrationId,'SR-ONE');
    await assert.rejects(
      route(ctx(['website-registrations','RS-ONE'],'GET','sruti',['sruti-admin'],srutiQuery)),
      (e:any)=>e.status===404
    );
    await assert.rejects(
      route(ctx(['website-registrations','SR-OTHER'],'GET','sruti',['sruti-admin'],srutiQuery)),
      (e:any)=>e.status===404
    );
  }))
);

test('Sruti review writes stay disabled and never invoke the legacy handler',async()=>
  env('M91_SRUTI_REVIEW_WRITES','disabled',async()=>{
    let touched=false;
    const route=makeM10RegistrationCutoverRoutes({
      list:async()=>{touched=true;return {items:[],more:false};},
      get:async()=>{touched=true;return null;}
    },async()=>{touched=true;return undefined;});
    const result=await route(ctx(
      ['website-registrations','SR-ONE'],'PATCH','sruti',['sruti-admin'],{institution:'sruti'}
    ));
    assert.equal(result?.statusCode,503);
    assert.equal(touched,false);
  })
);

test('Sruti-only administrator cannot request Raagasudha registration data',async()=>{
  const route=makeM10RegistrationCutoverRoutes({
    list:async()=>({items:[],more:false}),get:async()=>null
  });
  await assert.rejects(
    route(ctx(['website-registrations'],'GET','sruti',['sruti-admin'],{institution:'raaga'})),
    (e:any)=>e.status===403
  );
});

test('unmigrated Sruti photo and filtered listing routes fail closed',async()=>{
  const route=makeM10RegistrationCutoverRoutes({
    list:async()=>({items:[],more:false}),get:async()=>null
  });
  assert.equal((await route(ctx(
    ['website-registrations','SR-ONE','photos','a'],'GET','sruti',['sruti-admin'],{institution:'sruti'}
  )))?.statusCode,503);
  assert.equal((await route(ctx(
    ['website-registrations'],'GET','sruti',['sruti-admin'],{institution:'sruti',status:'pending'}
  )))?.statusCode,503);
});
