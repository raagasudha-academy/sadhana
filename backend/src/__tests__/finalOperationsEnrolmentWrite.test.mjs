import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOperationsEnrolmentWriteRoute as route} from '../finalOperationsEnrolmentWrite.mjs';
import {projectM10Directory} from '../coreDirectoryProjection.mjs';
const flags={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'final',SADHANA_FINAL_CORE_WRITES:'enabled'};
const calls=[];
const deps={assertConfigured:()=>{},parse:()=>({studentId:'per_student',classId:'cls_1',startDate:'2026-11-06',endDate:''}),core:()=>({create:async(...args)=>{calls.push(args);return {id:'enr_1'};}})};
const ctx=(method='POST',inst='sruti')=>({parts:['operations','enrolment'],method,claims:{sub:'admin'},query:{institution:inst},event:{}});
const access={admin:(_,inst)=>{if(inst!=='sruti')throw Error('forbidden');}};
test('writes canonical enrolment with scoped institution and legacy response shape',async()=>{
 calls.length=0;const r=await route(ctx(),deps,access,flags);
 assert.deepEqual(r,{status:201,body:{record:{id:'enr_1'}}});
 assert.equal(calls[0][0],'enrolments');assert.equal(calls[0][1],'sruti');assert.equal(calls[0][3].institution,'sruti');
});
test('disabled flag blocks all writes',async()=>{calls.length=0;assert.equal((await route(ctx(),deps,access,{...flags,SADHANA_FINAL_CORE_WRITES:'disabled'})).status,503);assert.equal(calls.length,0)});
test('split and missing ack cannot write',async()=>{for(const f of [{...flags,SADHANA_DATA_MODE:'split'},{...flags,SADHANA_ENTITY_FINAL_ACK:undefined}])assert.equal((await route(ctx(),deps,access,f)).status,503)});
test('rejects cross institution body before core write',async()=>{calls.length=0;assert.equal((await route(ctx(),{...deps,parse:()=>({institution:'raaga'})},access,flags)).status,403);assert.equal(calls.length,0)});
test('read requests and other operations are not intercepted',async()=>{assert.equal(await route(ctx('GET'),deps,access,flags),undefined);assert.equal(await route({...ctx(),parts:['operations','student']},deps,access,flags),undefined)});
test('canonical roll number projection follows selected academy even for legacy-shaped students',()=>{
 const item={personId:'per_a',personTypes:['student'],institutionIds:['sruti','raaga'],studentProfile:{rollNumbers:{sruti:'SR-004',raaga:'RS-002'}},legacyPayload:{id:'per_a',name:'A',rollNumber:'001-002'}};
 assert.equal(projectM10Directory('students',[item],'sruti').records[0].rollNumber,'SR-004');
 assert.equal(projectM10Directory('students',[item],'raaga').records[0].rollNumber,'RS-002');
});
test('missing roll numbers remain empty; projection never invents numbers',()=>{
 const item={personId:'per_a',familyId:'fam_a',firstName:'A',personTypes:['student'],institutionIds:['sruti']};
 assert.equal(projectM10Directory('students',[item],'sruti').records[0].rollNumber,'');
});
test('Lambda routes enrolment POST before final fence',()=>{
 const s=readFileSync(new URL('../lambda.ts',import.meta.url),'utf8');
 assert.ok(s.indexOf('finalOperationsEnrolmentWriteRoute(routeContext')<s.indexOf("finalOnlyGate(parts,method,'fallback')"));
});
