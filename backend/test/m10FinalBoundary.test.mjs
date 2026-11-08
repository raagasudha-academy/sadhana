import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalOnlyGate} from '../src/m10FinalBoundary.mjs';

const final = {SADHANA_ENTITY_TABLE_SET:'final'};
const m9 = {SADHANA_ENTITY_TABLE_SET:'m9'};
test('normal M9/live mode is completely unaffected',()=>{
  for(const phase of ['early','fallback'])
    for(const root of ['me','photos','students','classes','schedule','registrations','audit'])
      assert.equal(finalOnlyGate([root],'GET',phase,m9),null);
});
test('final mode refuses PK/SK identity/profile routes before early handlers',()=>{
  for(const root of ['me','photos','identities'])
    assert.equal(finalOnlyGate([root],'GET','early',final)?.status,503);
  assert.equal(finalOnlyGate(['identities','search'],'GET','early',final)?.status,503);
  assert.equal(finalOnlyGate(['schedule'],'GET','early',final),null);
});
test('final mode never falls back to generic repository or legacy routes',()=>{
  for(const root of ['students','classes','venues','schedule','events','registrations','audit','practice','family-access','website-registrations','homework','teachers','m9-onboarding'])
    assert.equal(finalOnlyGate([root],'GET','fallback',final)?.status,503);
  assert.equal(finalOnlyGate(['health'],'GET','fallback',final),null);
  assert.equal(finalOnlyGate(['health'],'POST','fallback',final)?.status,503);
});
test('unsupported recurring-class routes cannot fall through to calendar legacy handlers',()=>{
  for(const [method,parts] of [
    ['POST',['recurring-classes']],
    ['POST',['recurring-classes','preview']],
  ])assert.equal(finalOnlyGate(parts,method,'fallback',final)?.status,503);
});
test('boundary occurs before legacy handlers in the real Lambda dispatcher',()=>{
  const code=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
  const early=code.indexOf("finalOnlyGate(parts,method,'early')");
  const profile=code.indexOf("if(parts[0]==='me'&&parts[1]==='profile'");
  const fallback=code.indexOf("finalOnlyGate(parts,method,'fallback')");
  const legacy=code.indexOf('await learningRoutes(routeContext)');
  const calendar=code.indexOf('await calendarRoutes(routeContext)');
  assert.ok(early>=0 && profile>early);
  assert.ok(fallback>=0 && legacy>fallback && calendar>fallback);
  assert.ok(code.indexOf('await m10CoreFrontendWriteRoutes(routeContext)')<
            code.indexOf('await m10CoreDirectoryAuthoritativeRoutes(routeContext)'));
});
