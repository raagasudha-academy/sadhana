import test from 'node:test';
import assert from 'node:assert/strict';
import {academyRoll,permanentRoll} from '../academyRoll.mjs';
import {prepareWebsiteImport} from '../websiteImportCore.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const src=dirname(fileURLToPath(import.meta.url));
test('different academy sequences and padding',()=>{
 assert.equal(academyRoll('raaga',1),'RS-001');
 assert.equal(academyRoll('sruti',1),'SR-001');
 assert.equal(academyRoll('sruti',1000),'SR-1000');
 assert.throws(()=>academyRoll('other',1));
 assert.throws(()=>academyRoll('raaga',0));
});
test('all three writers allocate academy rolls without changing person/family identifiers',()=>{
 const core=readFileSync(join(src,'../coreWriteService.ts'),'utf8');
 const existing=readFileSync(join(src,'../srutiExistingImport.mjs'),'utf8');
 const initial=readFileSync(join(src,'../websiteImportCore.mjs'),'utf8');
 assert.match(core,/academyRoll\(inst,seq.previous\+1\)/);
 assert.match(existing,/permanentRoll\(students\[i\]\.studentProfile/);
 assert.doesNotMatch(existing,/counterAction\('STUDENT_ROLL'/);
 assert.match(initial,/academyRoll\(institution,counters.student\+i\+1\)/);
 for(const text of [core,initial]) assert.match(text,/ROLL_GLOBAL#/);
 assert.doesNotMatch(existing,/ROLL_UNIQUE#/);
});

test('joining a second academy reuses permanent roll and refuses inconsistent historical formats',()=>{
 assert.equal(permanentRoll({rollNumber:'RS-001',rollNumbers:{raaga:'RS-001'}},['raaga']),'RS-001');
 assert.equal(permanentRoll({rollNumbers:{raaga:'SR-002',sruti:'SR-002'}},['raaga','sruti']),'SR-002');
 assert.equal(permanentRoll({rollNumbers:{raaga:'001-001'}},['raaga']),null);
 assert.equal(permanentRoll({rollNumbers:{raaga:'RS-001',sruti:'SR-003'}},['raaga','sruti']),null);
});
