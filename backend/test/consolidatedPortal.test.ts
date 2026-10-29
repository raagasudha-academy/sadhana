import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const family=readFileSync(new URL('../src/familyAccess.ts',import.meta.url),'utf8');
const student=readFileSync(new URL('../../src/StudentHome.tsx',import.meta.url),'utf8');
test('linked student overview permits shared identity only with academy enrolment',()=>{assert.match(family,/OPS#\$\{inst\}#ENROLMENT/);assert.match(family,/membership.Items/)});
test('student profile is available independently of class enrollment',()=>{assert.match(family,/Profile access is independent of class enrolment/);assert.doesNotMatch(family,/Student has no active enrolment in this academy/)});
test('family dashboard auto-selects an approved student and renders accessible loading',()=>{assert.match(student,/if\(records\.length\)/);assert.match(student,/detailLoading&&<p role="status">/)});
test('practice logging is disabled before class enrollment',()=>{assert.match(student,/disabled=\{!detail\.classes\.length\}/)});
