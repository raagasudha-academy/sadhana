import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAdditionalSessionRows} from '../src/additionalSessions.ts';
test('additional sessions validate same-day times and batch limits',()=>{
 assert.equal(validateAdditionalSessionRows([{date:'2026-10-30',startTime:'10:00',endTime:'11:00'}]).length,1);
 assert.throws(()=>validateAdditionalSessionRows([{date:'2026-10-30',startTime:'12:00',endTime:'11:00'}]));
 assert.throws(()=>validateAdditionalSessionRows([{date:'2026-10-30',startTime:'10:00',endTime:'11:00'},{date:'2026-10-30',startTime:'10:00',endTime:'11:00'}]));
 assert.throws(()=>validateAdditionalSessionRows(Array.from({length:21},()=>({date:'2026-10-30',startTime:'10:00',endTime:'11:00'}))));
});
