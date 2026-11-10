import assert from 'node:assert/strict';
import test from 'node:test';
import {makeM10AuthoritativeSchedulingRoutes} from '../routes/authoritativeSchedulingRoutes.ts';

const sruti={sub:'sruti-only','cognito:groups':'sruti-admin'};
const raaga={sub:'raaga-only','cognito:groups':'raagasudha-admin'};
const dual={sub:'both','cognito:groups':['sruti-admin','raagasudha-admin']};
const envKeys=['M10_SCHEDULING_AUTHORITATIVE','M95_COMPAT_MODE','M95_CALENDAR_WRITES','M95_SERIES_WRITES','M95_MANAGED_EVENT_WRITES'] as const;
async function withFlags(fn:()=>Promise<void>,enabled=true){
 const before=envKeys.map(x=>process.env[x]);
 process.env.M10_SCHEDULING_AUTHORITATIVE=enabled?'enabled':'disabled';
 process.env.M95_COMPAT_MODE='pilot';process.env.M95_CALENDAR_WRITES='enabled';
 process.env.M95_SERIES_WRITES='enabled';process.env.M95_MANAGED_EVENT_WRITES='enabled';
 try{await fn();}finally{envKeys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});}
}
function fake(){
 const calls:string[]=[];
 const service={
  reader:{schedule:async(inst:string)=>{calls.push('schedule-read:'+inst);return {records:[],more:false};},managedEvents:async(inst:string)=>{calls.push('events-read:'+inst);return {records:[]};}},
  calendar:{create:async(inst:string)=>{calls.push('calendar-create:'+inst);return {record:{id:'X'}};},patch:async(inst:string)=>{calls.push('calendar-patch:'+inst);return {record:{id:'X'}};}},
  series:{preview:async(inst:string)=>{calls.push('series-preview:'+inst);return {};},change:async(inst:string)=>{calls.push('series-change:'+inst);return {}; }},
  events:{save:async(inst:string)=>{calls.push('event-save:'+inst);return {};},cancel:async(inst:string)=>{calls.push('event-cancel:'+inst);return {};},shared:async()=>{calls.push('shared');return {};}}
 };
 return {calls,route:makeM10AuthoritativeSchedulingRoutes(()=>service as any)};
}
function request(resource:string,method:string,inst:string,claims:any=sruti,body='{}'){
 return {parts:resource.split('/'),method,query:{institution:inst},inst,claims,
  groups:[],event:{body,isBase64Encoded:false}} as any;
}
test('disabled route leaves existing API untouched',async()=>withFlags(async()=>{
 const f=fake();assert.equal(await f.route(request('schedule','GET','sruti')),undefined);assert.deepEqual(f.calls,[]);
},false));
test('Sruti-only schedule read is allowed; Raagasudha is denied before storage',async()=>withFlags(async()=>{
 const f=fake();const ok=await f.route(request('schedule','GET','sruti'));
 assert.equal(ok?.statusCode,200);
 await assert.rejects(()=>f.route(request('schedule','GET','raaga')),{status:403});
 assert.deepEqual(f.calls,['schedule-read:sruti']);
}));
test('schedule create invokes M9 writer; denies cross-institution write',async()=>withFlags(async()=>{
 const f=fake();await assert.rejects(()=>f.route(request('schedule','POST','raaga')),{status:403});
 const ok=await f.route(request('schedule','POST','sruti'));
 assert.equal(ok?.statusCode,201);assert.deepEqual(f.calls,['calendar-create:sruti']);
}));
test('series and managed events route only to M9 writers',async()=>withFlags(async()=>{
 const f=fake();
 assert.equal((await f.route(request('schedule/series/CLASS-1','PATCH','sruti')))?.statusCode,200);
 assert.equal((await f.route(request('schedule/series/CLASS-1/preview','POST','sruti')))?.statusCode,200);
 assert.equal((await f.route(request('events','POST','sruti')))?.statusCode,201);
 assert.equal((await f.route(request('events','GET','raaga',dual)))?.statusCode,200);
 assert.deepEqual(f.calls,['series-change:sruti','series-preview:sruti','event-save:sruti','events-read:raaga']);
}));
test('unsupported calendar operations fail closed; never reach old route',async()=>withFlags(async()=>{
 const f=fake();
 assert.equal((await f.route(request('schedule/CLASS-1','DELETE','sruti')))?.statusCode,503);
 assert.equal((await f.route(request('schedule/series/CLASS-1/nope','POST','sruti')))?.statusCode,503);
 assert.equal((await f.route(request('events/abc/unknown','PATCH','sruti')))?.statusCode,503);
 assert.deepEqual(f.calls,[]);
}));
test('disabled M9 calendar writer rejects writes without calling a repository',async()=>withFlags(async()=>{
 process.env.M95_CALENDAR_WRITES='disabled';
 const f=fake();assert.equal((await f.route(request('schedule','POST','sruti')))?.statusCode,503);
 assert.deepEqual(f.calls,[]);
}));
test('invalid event cancellation version rejected before writer',async()=>withFlags(async()=>{
 const f=fake();await assert.rejects(()=>f.route(request('events/EVENT-1','DELETE','sruti')),{status:400});
 assert.deepEqual(f.calls,[]);
}));
