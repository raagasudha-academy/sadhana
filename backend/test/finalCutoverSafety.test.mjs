import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOnlyGate} from '../src/finalBoundary.mjs';
import {finalOperationsEnrolmentWriteRoute} from '../src/finalOperationsEnrolmentWrite.mjs';
const env={SADHANA_DATA_MODE:'final',SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_FINAL_CORE_WRITES:'enabled'};
test('unknown final route fails closed rather than entering legacy repository',()=>{
  assert.equal(finalOnlyGate(['totally-unknown'],'GET','fallback',env).status,503);
  assert.equal(finalOnlyGate(['health'],'GET','fallback',env),null);
});
test('legacy fallback never opens in final mode for unsupported writes',()=>{
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(finalOnlyGate(['unmigrated'],method,'fallback',env).status,503);
});
test('unsupported operations compatibility methods fail closed by exact method and path',()=>{
  for(const [method,parts] of [
    ['POST',['operations','family']],
    ['POST',['operations','attendance']],
    ['POST',['operations','practice']],
    ['POST',['operations','rsvp']],
    ['PATCH',['operations','attendance','ATT-1']],
    ['PATCH',['operations','practice','PRACTICE-1']],
    ['PATCH',['operations','rsvp','RSVP-1']],
    ['PATCH',['operations','student','STUDENT-1']],
  ]){
    const response=finalOnlyGate(parts,method,'fallback',env);
    assert.equal(response.status,503,`${method} /${parts.join('/')} must not fall through`);
    assert.match(response.error,/legacy database fallback blocked/);
  }
});
test('legacy practice mutation routes fail closed by exact method and path',()=>{
  for(const [method,parts] of [
    ['POST',['practice']],
    ['PATCH',['practice','PRACTICE-1']],
    ['PATCH',['practice','STUDENT-1','2026-11-08']],
  ]){
    const response=finalOnlyGate(parts,method,'fallback',env);
    assert.equal(response.status,503,`${method} /${parts.join('/')} must not fall through`);
    assert.match(response.error,/legacy database fallback blocked/);
  }
});
test('enrolment deletion is handled via canonical service',async()=>{
  let touched=0;
  const result=await finalOperationsEnrolmentWriteRoute({parts:['operations','enrolment','ENROLMENT-1'],method:'DELETE',claims:{sub:'verified'},query:{institution:'sruti'},event:{body:'{"confirm":"DELETE","expectedVersion":1}'}},{assertConfigured(){},parse:e=>JSON.parse(e.body),core:()=>({endEnrolment:async()=>{touched++;return {deleted:true,enrolmentId:'ENROLMENT-1'};}})},{admin(){}},env);
  assert.equal(result.status,200);assert.equal(touched,1);
});
test('enrolment DELETE rejects unsupported academy before touching data',async()=>{
  let touched=0;
  const result=await finalOperationsEnrolmentWriteRoute({parts:['operations','enrolment','ENROLMENT-1'],method:'DELETE',claims:{sub:'verified'},query:{institution:'wrong'},event:{body:'{}'}},{assertConfigured(){touched++},parse:()=>({}),core:()=>({endEnrolment(){touched++}})},{admin(){}},env);
  assert.equal(result.status,400);assert.equal(touched,0);
});
test('final routing does not let unsupported endpoints call legacy fallback',()=>{
  const source=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
  const fence=source.indexOf("if(process.env.SADHANA_ENTITY_TABLE_SET==='final'){",source.indexOf('finalCognitoSelfRoute(routeContext'));
  const legacy=source.indexOf('m10AuthoritativeSchedulingRoutes(routeContext)',fence);
  assert.ok(fence>=0&&legacy>fence);
  assert.match(source.slice(fence,legacy),/finalOnlyGate\(parts,method,'fallback'\)/);
});
