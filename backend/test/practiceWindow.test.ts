import test from 'node:test';
import assert from 'node:assert/strict';
import {isWithinPracticeWindow,ukPracticeToday} from '../src/practiceWindow.ts';
test('allows today and previous six UK dates',()=>{
 assert.equal(isWithinPracticeWindow('2026-10-29','2026-10-29'),true);
 assert.equal(isWithinPracticeWindow('2026-10-23','2026-10-29'),true);
 assert.equal(isWithinPracticeWindow('2026-10-22','2026-10-29'),false);
 assert.equal(isWithinPracticeWindow('2026-10-30','2026-10-29'),false);
});
test('handles month/year edges and invalid dates',()=>{
 assert.equal(isWithinPracticeWindow('2025-12-31','2026-01-06'),true);
 assert.equal(isWithinPracticeWindow('2025-12-30','2026-01-06'),false);
 assert.equal(isWithinPracticeWindow('2026-02-30','2026-03-01'),false);
});
test('DST dates are calendar days, not rolling 24-hour periods',()=>{
 assert.equal(isWithinPracticeWindow('2026-03-25','2026-03-31'),true);
 assert.equal(isWithinPracticeWindow('2026-10-25','2026-10-31'),true);
});
test('UK today respects the London clock',()=>{
 assert.equal(ukPracticeToday(new Date('2026-07-01T22:30:00Z')),'2026-07-01');
 assert.equal(ukPracticeToday(new Date('2026-07-01T23:30:00Z')),'2026-07-02');
});
