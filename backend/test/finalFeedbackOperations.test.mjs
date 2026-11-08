import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsRoute} from '../src/finalOperations.mjs';
const flags={SADHANA_ENTITY_TABLE_SET:'final'};
const access={view:()=>{},admin:()=>{},permittedInstitutions:c=>c.admin?[c.inst]:[],
 badInstitution:()=>{throw Error('bad institution')},forbid:()=>{throw Error('forbidden')}};
const records=[{id:'FEEDBACK-123',institution:'sruti',studentId:'S1',classId:'C1',date:'2026-11-06',note:'Well done'}];
let saved=[];
const deps={assertConfigured:()=>{},directory:async k=>k==='teacherMe'?{linked:true,teacherId:'T1'}:{records:[{id:'C1',teacherId:'T1'},{id:'C2',teacherId:'T2'}]},
 core:async()=>({records:[{studentId:'S1',classId:'C1',status:'active',startDate:'2026-01-01'}]}),
 teacherEnrolments:async()=>({records:[{studentId:'S1',classId:'C1',status:'active',startDate:'2026-01-01'}]}),
 feedback:{list:async(i,ids)=>({records:records.filter(r=>r.institution===i && (!ids||ids.has(r.classId)))}),get:async(i,id)=>records.find(r=>r.institution===i&&r.id===id)??null,
 save:async(...args)=>{saved.push(args);return {record:{id:'FEEDBACK-456'}};}}};
const ctx=(method='GET',admin=false,inst='sruti',data=null,id=null)=>({parts:['operations','feedback',...(id?[id]:[])],method,
 claims:{sub:'U',admin,inst},query:{institution:inst},event:{body:data?JSON.stringify(data):undefined,isBase64Encoded:false}});
test('admin feedback GET returns real canonical reader records for chosen academy',async()=>{
 assert.deepEqual((await finalOperationsRoute(ctx('GET',true),deps,access,flags)).body.records,records);
 assert.deepEqual((await finalOperationsRoute(ctx('GET',true,'raaga'),deps,access,flags)).body.records,[]);
});
test('teacher read is restricted to assigned class',async()=>{
 const d={...deps,feedback:{...deps.feedback,list:async(i,ids)=>({records:[{ids:[...ids]}]})}};
 assert.deepEqual((await finalOperationsRoute(ctx(),d,access,flags)).body.records[0].ids,['C1']);
});
test('unlinked teacher denied; no final mode or unknown shape is not dispatched',async()=>{
 await assert.rejects(finalOperationsRoute(ctx(),{...deps,directory:async()=>({linked:false})},access,flags),/forbidden/);
 assert.equal(await finalOperationsRoute(ctx('GET',true,'sruti',null,'FEEDBACK-123'),deps,access,flags),undefined);
 assert.equal(await finalOperationsRoute(ctx('GET',true),deps,access,{SADHANA_ENTITY_TABLE_SET:'m9'}),undefined);
});
test('feedback write requires independent feature flag; unrelated writes blocked',async()=>{
 const data={studentId:'S1',classId:'C1',date:'2026-11-06',note:'Good'};
 assert.equal((await finalOperationsRoute(ctx('POST',true,'sruti',data),deps,access,flags)).status,503);
 assert.equal(await finalOperationsRoute({...ctx('POST',true,'sruti',data),parts:['operations','practice']},deps,access,flags),undefined);
});
test('enabled write checks class enrolment and teacher assignment',async()=>{
 saved=[];
 const data={studentId:'S1',classId:'C1',date:'2026-11-06',note:'Great'};
 const on={...flags,SADHANA_FINAL_FEEDBACK_WRITES:'enabled'};
 assert.equal((await finalOperationsRoute(ctx('POST',false,'sruti',data),deps,access,on)).status,201);
 assert.equal(saved.length,1);
 await assert.rejects(finalOperationsRoute(ctx('POST',false,'sruti',{...data,classId:'C2'}),deps,access,on),/forbidden/);
 assert.equal((await finalOperationsRoute(ctx('POST',true,'sruti',{...data,studentId:'S2'}),deps,access,on)).status,403);
 assert.equal(saved.length,1);
});
test('feedback edit enforces existing record academy/class before database save',async()=>{
 const on={...flags,SADHANA_FINAL_FEEDBACK_WRITES:'enabled'};
 assert.equal((await finalOperationsRoute(ctx('PATCH',false,'sruti',{note:'Better',expectedVersion:1},'FEEDBACK-123'),deps,access,on)).status,200);
 assert.equal((await finalOperationsRoute(ctx('PATCH',true,'raaga',{note:'Bad',expectedVersion:1},'FEEDBACK-123'),deps,access,on)).status,404);
});
test('actual Lambda dispatch precedes final-only safety boundary',()=>{
 const s=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
 assert.match(s,/feedback:finalOperationsFeedback\(\)/);
 assert.ok(s.indexOf('finalOperationsRoute(routeContext')<s.indexOf("finalOnlyGate(parts,method,'fallback')"));
});
test('canonical feedback never appears as a practice record',()=>{
 const s=readFileSync(new URL('../src/finalOperationsHistory.ts',import.meta.url),'utf8');
 assert.match(s,/operational-feedback/);
 const read=readFileSync(new URL('../src/routes/operationalReadRoutes.ts',import.meta.url),'utf8');
 assert.match(read,/operational-feedback/);
 const learner=readFileSync(new URL('../src/finalAccessCore.mjs',import.meta.url),'utf8');
 assert.match(learner,/operational-feedback/);
});
