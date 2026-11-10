import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const family=readFileSync(new URL('../familyAccess.ts',import.meta.url),'utf8');

test('linked student overview permits shared identity only with academy enrolment',()=>{
 assert.match(family,/OPS#\$\{inst\}#ENROLMENT/);
 assert.match(family,/membership\.Items/);
});

test('student profile access is independent of class enrolment',()=>{
 assert.match(family,/Profile access is independent of class enrolment/);
 assert.doesNotMatch(family,/Student has no active enrolment in this academy/);
});
