import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10FrontendAcademyRoutes} from '../src/routes/m10FrontendAcademyRoutes.ts';
const admin={sub:'guardian-admin','cognito:groups':['raagasudha-admin']};
const outsider={sub:'sruti-admin','cognito:groups':['sruti-admin']};
const makeContext=(method:string,parts:string[],payload:any={},claims:any=admin)=>({
 method,parts,claims,inst:'raaga',groups:['raaga'],query:{institution:'raaga'},event:{body:JSON.stringify(payload)}
}) as any;
const sample={id:'CLASS-existing',institution:'raaga',name:'Vocal',teacher:'Teacher A',teacherUserId:'',day:2,time:'18:30',duration:60,mode:'Online',venueId:'',startDate:'2026-11-02',endDate:'',version:1,createdAt:'2026-11-02',updatedAt:'2026-11-02',archived:false};
function fake(previousOverride?:Record<string,any>){
 const calls:any[]=[];
 const previous=previousOverride??{classId:sample.id,institutionId:'raaga',name:sample.name,version:1,legacyPayload:sample};
 const deps={
  list:async()=>{calls.push(['list']);return {records:[sample],more:false};},
  get:async()=>{calls.push(['get']);return previous;},
  create:async(...a:any[])=>{calls.push(['create',...a]);return a[1];},
  update:async(...a:any[])=>{calls.push(['update',...a]);return {...previous,...a[3],version:2};}
 };
 return {calls,route:makeM10FrontendAcademyRoutes(()=>deps as any)};
}
async function flags(run:()=>Promise<void>,active=true){
 const names=['M10_FRONTEND_ACADEMY_ROUTING','M10_ACADEMY_CORE_WRITES','M9_TARGET_REPOSITORY_WRITES','M9_TARGET_REPOSITORY_ENABLED'];
 const old=names.map(n=>process.env[n]);
 try{for(const name of names)process.env[name]=active?(name==='M9_TARGET_REPOSITORY_ENABLED'?'read-only':'enabled'):'disabled';await run();}
 finally{names.forEach((n,i)=>old[i]===undefined?delete process.env[n]:process.env[n]=old[i]);}
}
test('feature flag off uses existing router, with zero M9 operations',async()=>{
 const {calls,route}=fake();await flags(async()=>{assert.equal(await route(makeContext('GET',['classes'])),undefined);},false);assert.equal(calls.length,0);
});
test('frontend GET returns M9 records without legacy lookup and enforces institution',async()=>{
 const {calls,route}=fake();await flags(async()=>{
  const answer=await route(makeContext('GET',['classes'])) as any;
  assert.equal(answer.statusCode,200);assert.equal(JSON.parse(answer.body).records[0].id,sample.id);
  await assert.rejects(()=>route(makeContext('GET',['classes'],{},outsider)),{status:403});
 });assert.deepEqual(calls,[['list']]);
});
test('frontend class create validates old UI fields and writes only canonical M9 item',async()=>{
 const {calls,route}=fake();await flags(async()=>{
  const {id,version,createdAt,updatedAt,archived,...input}=sample;
  const answer=await route(makeContext('POST',['classes'],input)) as any;
  assert.equal(answer.statusCode,201);
  assert.equal(JSON.parse(answer.body).record.name,'Vocal');
  assert.equal(calls[0][0],'create');assert.equal(calls[0][1],'classes');
  assert.equal(calls[0][2].institutionId,'raaga');
  assert.ok(!('PK' in calls[0][2]));
  await assert.rejects(()=>route(makeContext('POST',['classes'],{...input,institution:'sruti'})),{status:403});
  await assert.rejects(()=>route(makeContext('POST',['classes'],{...input,PK:'bad'})),{status:400});
 });
});
test('frontend PATCH preserves previous record, version and institution guard',async()=>{
 const {calls,route}=fake();await flags(async()=>{
  const answer=await route(makeContext('PATCH',['classes',sample.id],{expectedVersion:1,name:'New Vocal'})) as any;
  assert.equal(answer.statusCode,200);
  assert.equal(JSON.parse(answer.body).record.version,2);
  assert.equal(calls.at(-1)?.[0],'update');
  assert.equal(calls.at(-1)?.[5],'raaga');
  assert.equal(calls.at(-1)?.[4]?.legacyPayload.name,'New Vocal');
  assert.equal((await route(makeContext('PATCH',['classes',sample.id],{expectedVersion:2,name:'Oops'})) as any).statusCode,409);
  await assert.rejects(()=>route(makeContext('PATCH',['classes',sample.id],{expectedVersion:1,PK:'bad'})),{status:400});
  const moved=await route(makeContext('PATCH',['classes',sample.id],{expectedVersion:1,institution:'sruti'})) as any;
  assert.equal(moved.statusCode,403);
 });
});
test('venue without institutionId fails closed on edit (shared legacy venue)',async()=>{
 const venue={id:'VENUE-1',name:'Community Hall',location:'Leeds',address:'12 Main St',postcode:'LS1 1AA',notes:'',version:1,createdAt:'2026-11-02',updatedAt:'2026-11-02',archived:false};
 const {route}=fake({venueId:'VENUE-1',name:venue.name,version:1,legacyPayload:venue});await flags(async()=>{
  const answer=await route(makeContext('PATCH',['venues','VENUE-1'],{expectedVersion:1,name:'New Venue'})) as any;
  assert.equal(answer.statusCode,403);
 });
});

test('venue PATCH validates only editable legacy fields and retains metadata',async()=>{
 const venue={id:'VENUE-1',name:'Community Hall',location:'Leeds',address:'12 Main St',postcode:'LS1 1AA',notes:'',version:1,createdAt:'2026-11-02',updatedAt:'2026-11-02',archived:false};
 const {calls,route}=fake({venueId:'VENUE-1',institutionId:'raaga',name:venue.name,version:1,legacyPayload:venue});
 await flags(async()=>{
  const answer=await route(makeContext('PATCH',['venues','VENUE-1'],{expectedVersion:1,name:'New Hall'})) as any;
  assert.equal(answer.statusCode,200);
  const result=JSON.parse(answer.body).record;
  assert.equal(result.id,'VENUE-1');
  assert.equal(result.name,'New Hall');
  assert.equal(result.version,2);
  assert.equal(calls.at(-1)?.[4]?.legacyPayload.location,'Leeds');
 });
});
