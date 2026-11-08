import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {m9CutoverFence} from '../src/cutoverFence.mjs';
const options={strict:true,homeworkWrites:true,learnerWrites:true,learnerReads:true};
for(const [parts,method] of [
 [['homework','CLASS-ABC'],'GET'],[['homework','CLASS-ABC'],'POST'],[['homework','CLASS-ABC','HOMEWORK-00000000-0000-0000-0000-000000000000'],'PUT'],
 [['homework','CLASS-ABC','submissions','HOMEWORK-00000000-0000-0000-0000-000000000000'],'GET'],
 [['homework','CLASS-ABC','feedback','HOMEWORK-00000000-0000-0000-0000-000000000000','PERSON-1'],'POST'],
 [['learner','STUDENT-1','homework'],'GET'],[['learner','STUDENT-1','homework'],'POST'],
 [['learner','STUDENT-1','submission','HOMEWORK-00000000-0000-0000-0000-000000000000'],'GET'],
 [['learner','STUDENT-1','submission','HOMEWORK-00000000-0000-0000-0000-000000000000'],'PUT'],
])test(`${method} /${parts.join('/')} is explicitly M9`,()=>assert.equal(m9CutoverFence(parts,method,options),null));
for(const [parts,method] of [
 [['homework','CLASS-ABC','materials','H','start'],'POST'],
 [['learner','STUDENT-1','submission','H','evidence','start'],'POST'],
 [['learner','STUDENT-1','homework','H','materials'],'GET'],
 [['teacher-practice','P','comments'],'POST'],
 [['registrations'],'POST']
])test(`${method} /${parts.join('/')} cannot access legacy under fence`,()=>assert.equal(m9CutoverFence(parts,method,options)?.status,503));
test('disabled homework flag blocks even migrated routes',()=>assert.equal(m9CutoverFence(['homework','CLASS-ABC'],'POST',{...options,homeworkWrites:false})?.status,503));
