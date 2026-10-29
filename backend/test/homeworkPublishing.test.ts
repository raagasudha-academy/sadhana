import test from 'node:test';
import assert from 'node:assert/strict';
import {ukLocalToIso,validateHomeworkSchedule,isHomeworkOpenAt,isHomeworkReleased} from '../src/homeworkPublishingPolicy.ts';
test('UK winter and summer cutoff',()=>{
 assert.equal(ukLocalToIso('2026-10-29','23:59'),'2026-10-29T23:59:00.000Z');
 assert.equal(ukLocalToIso('2026-07-29','23:59'),'2026-07-29T22:59:00.000Z');
});
test('reject nonexistent spring clock-change time',()=>assert.throws(()=>ukLocalToIso('2026-03-29','01:30')));
test('ambiguous autumn hour resolves to earliest matching instant',()=>assert.equal(ukLocalToIso('2026-10-25','01:30'),'2026-10-25T00:30:00.000Z'));
test('old assignments preserve 23:59 UK deadline',()=>{
 assert.equal(isHomeworkOpenAt({dueDate:'2026-07-29'},new Date('2026-07-29T22:58:00Z')),true);
 assert.equal(isHomeworkOpenAt({dueDate:'2026-07-29'},new Date('2026-07-29T23:00:00Z')),false);
});
test('scheduled release and private student visibility',()=>{
 assert.equal(isHomeworkReleased({releaseAt:'2026-10-29T12:00:00.000Z'},new Date('2026-10-29T11:00:00Z')),false);
 assert.equal(isHomeworkReleased({releaseAt:'2026-10-29T12:00:00.000Z'},new Date('2026-10-29T12:00:00Z')),true);
});
test('default grading disabled and due time 23:59',()=>{
 const x=validateHomeworkSchedule('2026-11-01',undefined,undefined,undefined);
 assert.equal(x.dueTime,'23:59');assert.equal(x.gradingEnabled,false);assert.equal(x.releaseAt,null);
});
test('reject inconsistent or malformed schedule',()=>{
 assert.throws(()=>validateHomeworkSchedule('2026-11-01','25:00',undefined,false));
 assert.throws(()=>validateHomeworkSchedule('2026-11-01',undefined,'2026-11-02T00:00:00Z',false));
 assert.throws(()=>validateHomeworkSchedule('2026-11-01',undefined,undefined,'yes'));
});
