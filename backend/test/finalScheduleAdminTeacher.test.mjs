import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalSchedulingWriteRoute} from '../src/finalSchedulingWrites.mjs';

const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final',SADHANA_FINAL_CALENDAR_WRITES:'enabled',SADHANA_FINAL_SERIES_WRITES:'enabled'};
const calls=[];
const api={
 createTeacherSession:async(...args)=>(calls.push(['teacher-create',...args]),{record:{}}),
 updateTeacherSession:async(...args)=>(calls.push(['teacher-patch',...args]),{record:{}}),
 deleteSession:async(...args)=>(calls.push(['session-delete',...args]),{deleted:true}),
 previewDeleteClass:async(...args)=>(calls.push(['class-preview',...args]),{signature:'test'}),
 deleteClass:async(...args)=>(calls.push(['class-delete',...args]),{deleted:true}),
 previewDeleteSeries:async(...args)=>(calls.push(['series-preview',...args]),{count:1}),
 deleteSeries:async(...args)=>(calls.push(['series-delete',...args]),{deleted:true}),
};
const deps={assertConfigured:()=>{},parse:e=>JSON.parse(e.body||'{}'),sessions:()=>api,
 calendar:()=>({create:async()=>({record:{}}),patch:async()=>({record:{}})}),
 series:()=>({change:async()=>({}),preview:async()=>({})}),events:()=>({})};
const deny=()=>{throw Object.assign(new Error('Forbidden'),{status:403})};
const access={admin:(claims,inst)=>{if(!claims.admin?.includes(inst))deny()},view:(claims,inst)=>{if(!claims.view?.includes(inst))deny()},permittedInstitutions:claims=>claims.admin||[],viewableInstitutions:claims=>claims.view||[],deny};
const admin={sub:'admin',admin:['raaga','sruti'],view:['raaga','sruti']};
const teacher={sub:'teacher',admin:[],view:['sruti']};
const ctx=(path,method,who=admin,inst='sruti')=>({parts:path.split('/'),method,claims:who,query:{institution:inst},event:{body:JSON.stringify({expectedVersion:1,confirm:true,signature:'test'})}});
const run=(path,method,who=admin,inst='sruti',flags=env)=>finalSchedulingWriteRoute(ctx(path,method,who,inst),deps,access,flags);

test('admin can preview and delete a master class in its academy',async()=>{
 calls.length=0;
 assert.equal((await run('schedule/master/CLASS-12345/delete-preview','POST')).status,200);
 assert.equal((await run('schedule/master/CLASS-12345','DELETE')).status,200);
 assert.deepEqual(calls.map(x=>x[0]),['class-preview','class-delete']);
});
test('admin can delete individual and ranged sessions',async()=>{
 calls.length=0;
 assert.equal((await run('schedule/EVT-12345','DELETE')).status,200);
 assert.equal((await run('schedule/series/CLASS-12345/delete-preview','POST')).status,200);
 assert.equal((await run('schedule/series/CLASS-12345','DELETE')).status,200);
 assert.deepEqual(calls.map(x=>x[0]),['session-delete','series-preview','series-delete']);
});
test('verified teacher is routed to canonical session create, edit and single delete',async()=>{
 calls.length=0;
 for(const [path,method] of [['schedule','POST'],['schedule/EVT-12345','PATCH'],['schedule/EVT-12345','DELETE']])assert.ok([200,201].includes((await run(path,method,teacher)).status));
 assert.deepEqual(calls.map(x=>x[0]),['teacher-create','teacher-patch','session-delete']);
 assert.equal(calls[2].at(-1),false);
});
test('teachers cannot delete classes, edit series, or manage another academy',async()=>{
 calls.length=0;
 for(const [path,method] of [['schedule/master/CLASS-12345','DELETE'],['schedule/master/CLASS-12345/delete-preview','POST'],['schedule/series/CLASS-12345','DELETE'],['schedule/series/CLASS-12345','PATCH']])
  await assert.rejects(()=>run(path,method,teacher),{status:403});
 await assert.rejects(()=>run('schedule','POST',teacher,'raaga'),{status:403});
 assert.equal(calls.length,0);
});
test('disabled final calendar writes fail closed, not legacy fallback',async()=>{
 calls.length=0;
 assert.equal((await run('schedule/EVT-12345','DELETE',teacher,'sruti',{...env,SADHANA_FINAL_CALENDAR_WRITES:'off'})).status,503);
 assert.deepEqual(calls,[]);
});
test('runtime wiring uses canonical service before old route boundary',()=>{
 const lambda=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 const service=readFileSync(new URL('../src/finalScheduleSessionAdmin.ts',import.meta.url),'utf8');
 assert.ok(lambda.includes('defaultM10FinalScheduleSessionAdmin'));
 assert.ok(service.includes("entityTable(kind)"));
 assert.ok(!service.includes('SADHANA_TABLE_NAME'));
 assert.ok(lambda.indexOf('await finalSchedulingWriteRoute(')<lambda.indexOf("finalOnlyGate(parts,method,'fallback')"));
});
