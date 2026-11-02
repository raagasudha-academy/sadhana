import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('student week view uses its own date anchor and controls',()=>{
 const s=readFileSync('src/StudentHome.tsx','utf8');
 assert.match(s,/const weekDays=Array\.from\(\{length:7\}/);
 assert.match(s,/weekDays\.map\(day=>/);
 assert.match(s,/setWeekAnchor\(d=>shiftWeek\(d,-1\)\)/);
 assert.match(s,/setWeekAnchor\(d=>shiftWeek\(d,1\)\)/);
 assert.match(s,/weekLabel\(weekAnchor\)/);
});
