import {test} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('student week view uses its own date anchor and controls',()=>{
 const s=readFileSync('app/src/features/learning/StudentTimetable.tsx','utf8');
 const page=readFileSync('app/src/features/learning/StudentCalendarPage.tsx','utf8');
 assert.match(s,/const weekDays=Array\.from\(\{length:7\}/);
 assert.match(s,/weekDays\.map\(day=>/);
 assert.match(page,/setWeekAnchor\(d=>shiftWeek\(d,-1\)\)/);
 assert.match(page,/setWeekAnchor\(d=>shiftWeek\(d,1\)\)/);
 assert.match(s,/weekLabel\(weekAnchor\)/);
});
