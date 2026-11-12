import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactSource } from '../../sourceText';

test('student week view uses its own date anchor and controls', () => {
  const s = compactSource(readFileSync('app/src/features/learning/StudentTimetable.tsx', 'utf8'));
  const page = compactSource(
    readFileSync('app/src/features/learning/StudentCalendarPage.tsx', 'utf8'),
  );
  assert.match(s, /constweekDays=Array\.from\(\{length:7\}/);
  assert.match(s, /weekDays\.map\(\(day\)=>/);
  assert.match(page, /setWeekAnchor\(\(d\)=>shiftWeek\(d,-1\)\)/);
  assert.match(page, /setWeekAnchor\(\(d\)=>shiftWeek\(d,1\)\)/);
  assert.match(s, /weekLabel\(weekAnchor\)/);
});
