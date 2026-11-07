import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalSchedulingWriteRoute} from '../src/m10FinalSchedulingWrites.mjs';

const base={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'off'};
const enabled={...base,SADHANA_FINAL_CALENDAR_WRITES:'enabled',SADHANA_FINAL_SERIES_WRITES:'enabled',SADHANA_FINAL_EVENT_WRITES:'enabled'};
let calls=[];
const deps={
 assertConfigured:()=>calls.push('assert'),
 parse:e=>(calls.push('parse'),JSON.parse(e.body||'{}')),
 calendar:()=>({create:async(inst,body)=>(calls.push(['calendar.create',inst,body]),{ok:true}),patch:async(inst,id,body)=>(calls.push(['calendar.patch',inst,id,body]),{ok:true})}),
 series:()=>({change:async(inst,id,body)=>(calls.push(['series.change',inst,id,body]),{ok:true}),preview:async(inst,id,body)=>(calls.push(['series.preview',inst,id,body]),{ok:true})}),
 events:()=>({save:async(inst,who,body,id)=>(calls.push(['events.save',inst,who.sub,body,id]),{ok:true}),cancel:async(inst,who,id,v)=>(calls.push(['events.cancel',inst,who.sub,id,v]),{ok:true}),shared:async(who,body,id,cancel)=>(calls.push(['events.shared',who.sub,body,id,cancel]),{ok:true})})
};
const forbidden=()=>{throw Object.assign(new Error('Denied'),{status:403});};
const access={
 permittedInstitutions:who=>who.admin??[],
 admin:(who,inst)=>{if(!who.admin?.includes(inst))forbidden();},
 view:(who,inst)=>{if(!who.view?.includes(inst)&&!who.admin?.includes(inst))forbidden();},
 viewableInstitutions:who=>who.view??who.admin??[],
 deny:forbidden
};
const admin={sub:'valid-sub',admin:['raaga'],view:['raaga']};
const dual={sub:'dual-sub',admin:['raaga','sruti'],view:['raaga','sruti']};
const student={sub:'student-sub',view:[]};
const context=(path,method='POST',inst='raaga',claims=admin,body={name:'Example'})=>({parts:path.split('/'),method,query:{institution:inst},inst,claims,event:{body:JSON.stringify(body)}});
const run=(path,method='POST',inst='raaga',who=admin,body={name:'Example'},env=enabled)=>finalSchedulingWriteRoute(context(path,method,inst,who,body),deps,access,env);
const reset=()=>{calls=[]};

test('existing M9 mode untouched, including no AWS resolver invocation',async()=>{
 reset();assert.equal(await run('schedule','POST','raaga',admin,{}, {...enabled,SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);assert.deepEqual(calls,[]);
});
test('GETs handled separately by canonical reader; unrelated routes untouched',async()=>{
 reset();assert.equal(await run('schedule','GET'),undefined);assert.equal(await run('classes','POST'),undefined);assert.deepEqual(calls,[]);
});
test('final scheduler explicitly denies split, missing ACK, and missing per-category optin before DB',async()=>{
 for(const env of [{...enabled,SADHANA_DATA_MODE:'split'},{...enabled,SADHANA_ENTITY_FINAL_ACK:''},{...base}]){
  reset();const result=await run('schedule','POST','raaga',admin,{},env);assert.equal(result.status,503);assert.deepEqual(calls,[]);
 }
 reset();const r=await run('events','POST','raaga',admin,{}, {...base,SADHANA_FINAL_CALENDAR_WRITES:'enabled'});assert.equal(r.status,503);assert.deepEqual(calls,[]);
});
test('final academy scheduling creates/updates with original actor and institution',async()=>{
 reset();assert.equal((await run('schedule','POST')).status,201);
 assert.equal((await run('schedule/CLS-1234','PATCH','raaga',admin,{expectedVersion:1})).status,200);
 assert.deepEqual(calls.filter(Array.isArray),[['calendar.create','raaga',{name:'Example'}],['calendar.patch','raaga','CLS-1234',{expectedVersion:1}]]);
});
test('final schedule series changes and previews use original M95 writer',async()=>{
 reset();await run('schedule/series/CLS-1234','PATCH');await run('schedule/series/CLS-1234/preview');
 assert.deepEqual(calls.filter(Array.isArray).map(x=>x[0]),['series.change','series.preview']);
});
test('final schedule is admin only, cannot cross academy or write shared holidays',async()=>{
 reset();await assert.rejects(()=>run('schedule','POST','sruti',admin),{status:403});
 await assert.rejects(()=>run('schedule','POST','raaga',student),{status:403});
 assert.equal((await run('schedule','POST','shared',dual)).status,400);
 assert.deepEqual(calls, ['assert','assert','assert']);
});
test('final managed events keep academy checks and delegate teacher identity verification to established writer',async()=>{
 reset();assert.equal((await run('events')).status,201);
 assert.equal((await run('events/EVT-1234','PATCH')).status,200);
 assert.equal((await run('events/EVT-1234','DELETE','raaga',admin,{expectedVersion:3})).status,200);
 assert.deepEqual(calls.filter(Array.isArray).map(x=>x[0]),['events.save','events.save','events.cancel']);
 await assert.rejects(()=>run('events','POST','sruti',admin),{status:403});
});
test('shared managed event writes delegate dual-admin enforcement to existing writer',async()=>{
 reset();assert.equal((await run('events/shared','POST','raaga',dual)).status,201);
 assert.equal((await run('events/shared/EVT-1234','PATCH','raaga',dual)).status,200);
 assert.equal((await run('events/shared/EVT-1234','DELETE','raaga',dual)).status,200);
 assert.deepEqual(calls.filter(Array.isArray).map(x=>x[0]),['events.shared','events.shared','events.shared']);
 await assert.rejects(()=>run('events/shared','POST','raaga',student),{status:403});
});
test('unsupported calendar and event writes never fall back',async()=>{
 reset();for(const path of ['schedule/unknown/path','events/one/two/three','schedule/series/bad','events/invalid!']){
  const result=await run(path,'PATCH');assert.equal(result.status,503);
 }
 assert.equal((await run('events/EVT-1234','DELETE','raaga',admin,{})).status,400);
 assert.equal((await run('schedule','PUT')).status,405);
 assert.deepEqual(calls.filter(Array.isArray),[]);
});
test('final write dispatch precedes old pilot/final boundary in real Lambda',()=>{
 const code=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 assert.ok(code.indexOf('await finalSchedulingWriteRoute(')<code.indexOf('await m10AuthoritativeSchedulingRoutes('));
 assert.ok(code.indexOf('await finalSchedulingWriteRoute(')<code.indexOf('finalOnlyGate(parts,method,\'fallback\')'));
});
test('all three underlying M95 writer opt-in checks require final mode and final-specific flags',()=>{
 for(const [name,flag] of [['m95CalendarWrite.ts','SADHANA_FINAL_CALENDAR_WRITES'],['m95SeriesWrite.ts','SADHANA_FINAL_SERIES_WRITES'],['m95ManagedEventWrite.ts','SADHANA_FINAL_EVENT_WRITES']]){
  const code=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
  assert.ok(code.includes("process.env.SADHANA_ENTITY_TABLE_SET==='final'"));
  assert.ok(code.includes(`process.env.${flag}!=='enabled'`));
  assert.ok(code.includes("process.env.SADHANA_DATA_MODE==='split'"));
 }
});
