/** Sadhana M10 final-route behavioural gate, read-only and offline.
 * Runs source-dispatch checks and actual facade calls with injected fake readers.
 * Does not set process.env, invoke AWS, deploy Lambda, or grant production approval.
 */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {finalOnlyGate} from '../src/finalBoundary.mjs';
import {finalReadRoute} from '../src/finalReadRoutes.mjs';
import {finalFamilyAccessRoute} from '../src/finalFamilyAccess.mjs';
import {finalLearningRoute} from '../src/finalLearning.mjs';
import {finalRegistrationRoute} from '../src/finalRegistration.mjs';
import {finalRaagaIntakeRoute} from '../src/finalRaagaIntake.mjs';
import {finalCoreIdentityRoute} from '../src/finalCoreIdentity.mjs';
import {assessCutover} from './productionCutoverGate.mjs';

const backend=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source=readFileSync(resolve(backend,'src/lambda.ts'),'utf8');
const env={SADHANA_ENTITY_TABLE_SET:'final',SADHANA_DATA_MODE:'final',SADHANA_ENTITY_FINAL_ACK:'enabled'};
const ctx=(method,parts,institution='raaga')=>({method,parts,claims:{sub:'subject-verified-0001'},query:{institution},inst:institution,event:{body:'{}'}});
const cases=[];
const check=async (name,fn)=>{
  try {await fn();cases.push({name,result:'PASS'});}
  catch(e){cases.push({name,result:'FAIL',reason:String(e?.message??e)});}
};
const requireOrder=(earlier,later)=>{
  const a=source.indexOf(earlier),b=source.indexOf(later);
  assert.ok(a>=0&&b>=0&&a<b,`Expected ${earlier} before ${later}`);
};

await check('Lambda final dispatch intercepts legacy fallback',()=>{
  const ordered=['finalReadRoute(routeContext','finalFamilyAccessRoute(routeContext',
   'finalSchedulingWriteRoute(routeContext','finalCoreIdentityRoute(routeContext',
   'finalRegistrationRoute(routeContext','finalLearningRoute(routeContext',
   'finalAdministratorRoute(routeContext','finalCognitoSelfRoute(routeContext'];
  for(let i=0;i<ordered.length-1;i++)requireOrder(ordered[i],ordered[i+1]);
  for(const route of ordered)requireOrder(route,"if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){\n        {const blocked=finalOnlyGate");
  requireOrder("if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){\n        {const blocked=finalOnlyGate",'m10AuthoritativeSchedulingRoutes(routeContext)');
  requireOrder("if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){\n        {const blocked=finalOnlyGate",'learningRoutes(routeContext)');
  requireOrder("if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){\n        {const blocked=finalOnlyGate",'repository.create(resource');
});
await check('Final fallback refuses legacy resource and identity routes',()=>{
  for(const [path,method] of [[['students'],'POST'],[['calendar'],'GET'],[['me','profile'],'PATCH'],[['family-access','unknown'],'POST']]){
    const r=finalOnlyGate(path,method,'fallback',env);
    assert.equal(r?.status,503);
  }
});
await check('Canonical class read is delegated to canonical directory',async()=>{
  let called=0;
  const readers={assertConfigured(){},directory:async()=>{called++;return {records:[{id:'class-001'}]};}};
  const access={view(){},admin(){},viewableInstitutions:()=>['raaga'],permittedInstitutions:()=>['raaga']};
  const result=await finalReadRoute(ctx('GET',['classes']),readers,access,env);
  assert.equal(result.status,200);assert.equal(called,1);
});
await check('Approved family reader is independent and final-only',async()=>{
  let calls=0;
  const deps={assertConfigured(){calls++;},reader(){calls++;return {peopleForSubject:async()=>[]};}};
  const custom={...env,SADHANA_FINAL_FAMILY_READS:'enabled'};
  const result=await finalFamilyAccessRoute(ctx('GET',['family-access','mine']),deps,custom);
  assert.equal(result.status,200);assert.deepEqual(result.body,{records:[]});assert.equal(calls,2);
  calls=0;
  const split=await finalFamilyAccessRoute(ctx('GET',['family-access','mine']),deps,{...custom,SADHANA_DATA_MODE:'split'});
  assert.equal(split.status,503);assert.equal(calls,0);
});
await check('Learner dashboard succeeds only behind independent final flag',async()=>{
  let calls=0;
  const deps={assertConfigured(){},learner:()=>({dashboard:async()=>{calls++;return {studentId:'student-0001'};}})};
  const context=ctx('GET',['learner','student-0001','dashboard']);
  const off=await finalLearningRoute(context,deps,env);
  assert.equal(off.status,503);assert.equal(calls,0);
  const on=await finalLearningRoute(context,deps,{...env,SADHANA_FINAL_LEARNER_READS:'enabled'});
  assert.equal(on.status,200);assert.equal(calls,1);
});
await check('Homework material routes do not bypass media flag',async()=>{
  let calls=0;
  const context=ctx('GET',['homework','class-0001','materials','hw-0001','links']);
  const deps={assertConfigured(){},homework:()=>({teacherMaterialLinks:async()=>{calls++;return {links:[]};}})};
  const custom={...env,SADHANA_FINAL_HOMEWORK_READS:'enabled'};
  const off=await finalLearningRoute(context,deps,custom);
  assert.equal(off.status,503);assert.equal(calls,0);
  const on=await finalLearningRoute(context,deps,{...custom,SADHANA_FINAL_HOMEWORK_MEDIA:'enabled'});
  assert.equal(on.status,200);assert.equal(calls,1);
});
await check('Sruti registration reads require independently verified ingress',async()=>{
  let calls=0;
  const c=ctx('GET',['website-registrations'],'sruti');
  const deps={assertConfigured(){},registration:async()=>{calls++;return {statusCode:200,body:'{"records":[]}'};}};
  const access={admin(){}};
  const flags={...env,SADHANA_FINAL_SRUTI_REGISTRATION_READS:'enabled'};
  const off=await finalRegistrationRoute(c,deps,access,flags);
  assert.equal(off.status,503);assert.equal(calls,0);
  const on=await finalRegistrationRoute(c,deps,access,{...flags,SADHANA_FINAL_SRUTI_INGRESS_READY:'enabled'});
  assert.equal(on.status,200);assert.equal(calls,1);
});
await check('Raagasudha account status reads use canonical reader',async()=>{
  let calls=0;
  const c=ctx('GET',['website-registrations','RS-2026-726C9A','access-status']);
  const deps={assertConfigured(){},parentStatus:async()=>{calls++;return {status:'EXISTING_ACCOUNT_LINKED'};}};
  const off=await finalRaagaIntakeRoute(c,deps,env);
  assert.equal(off.status,503);assert.equal(calls,0);
  const on=await finalRaagaIntakeRoute(c,deps,{...env,SADHANA_FINAL_RAAGA_PARENT_STATUS_READS:'enabled'});
  assert.equal(on.status,200);assert.equal(calls,1);
});
await check('Guardian write path cannot run in split mode',async()=>{
  let calls=0;
  const deps={assertConfigured(){calls++;},guardian:()=>{calls++;return {};}};
  const response=await finalCoreIdentityRoute(ctx('POST',['family-access','request']),deps,{admin(){}},
    {...env,SADHANA_DATA_MODE:'split',SADHANA_FINAL_GUARDIAN_REQUESTS:'enabled'});
  assert.equal(response.status,503);assert.equal(calls,0);
});

const tests = readdirSync(resolve(backend,'src/__tests__')).filter(x=>/^final.*\.test\.mjs$/.test(x)||['additionalSessionsFinal.test.mjs','entityTables.test.mjs','productionCutoverGate.test.mjs','raagaWebsiteSyncPolicy.test.mjs'].includes(x)).sort();
let regression={status:'SKIPPED',files:tests.length};
if(!process.argv.includes('--skip-regressions')){
 const testRun=spawnSync(process.execPath,['--test',...tests.map(x=>resolve(backend,'src/__tests__',x))],{encoding:'utf8',maxBuffer:8*1024*1024});
 const output=(testRun.stdout??'')+'\n'+(testRun.stderr??'');
 const number=key=>Number(output.match(new RegExp(`(?:^|\\n)[#ℹ]\\s*${key}\\s+(\\d+)`))?.[1]??NaN);
 regression={status:testRun.status===0?'PASS':'FAIL',files:tests.length,tests:number('tests'),passed:number('pass'),failed:number('fail'),exitCode:testRun.status};
 if(testRun.status!==0)regression.tail=output.slice(-2600);
}
const staticGate=assessCutover();
const failed=cases.filter(x=>x.result!=='PASS');
const offlinePassed=failed.length===0&&regression.status==='PASS';
const report={schema:1,mode:'OFFLINE_READ_ONLY',testedAgainst:'local source; no AWS calls',
  cases,regression,
  legacyStaticGate:{ready:staticGate.fullM9DatabaseCutoverReady,blockers:staticGate.blockers,
    interpretation:'Source-reference findings, not evidence that the final dispatcher can reach those handlers'},
  offlineBehaviouralRouteGate:offlinePassed?'PASS':'FAIL',
  productionFinalModeApproved:false,
  productionBlockers:[
   'No authenticated live final-mode canary established for every required role and route',
   'Required final feature-flag values and effective access on all 18 tables/indexes not fully verified',
   'Main API and independent Sruti intake write freeze not established',
   '10 historical audit records still need freeze-protected catch-up',
   'Sruti final-only writer switch is not yet active',
   'Legacy table inactivity and rollback recoverability not demonstrated'
  ]};
console.log(JSON.stringify(report,null,2));
if(!offlinePassed)process.exitCode=2;
