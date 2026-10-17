import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {recurrenceDates} from '../src/recurringClasses.ts';
test('daily schedule every two days',()=>assert.deepEqual(recurrenceDates('2026-10-19',{frequency:'daily',interval:2,endMode:'count',count:3}),['2026-10-19','2026-10-21','2026-10-23']));
test('weekly Monday and Wednesday',()=>assert.deepEqual(recurrenceDates('2026-10-19',{frequency:'weekly',interval:1,weekdays:[1,3],endMode:'count',count:4}),['2026-10-19','2026-10-21','2026-10-26','2026-10-28']));
test('alternate Mondays',()=>assert.deepEqual(recurrenceDates('2026-10-19',{frequency:'weekly',interval:2,weekdays:[1],endMode:'count',count:3}),['2026-10-19','2026-11-02','2026-11-16']));
test('monthly skips missing day',()=>assert.deepEqual(recurrenceDates('2026-01-31',{frequency:'monthly',interval:1,endMode:'count',count:3}),['2026-01-31','2026-03-31','2026-05-31']));
test('inclusive end date',()=>assert.deepEqual(recurrenceDates('2026-10-19',{frequency:'weekly',interval:1,weekdays:[1],endMode:'date',until:'2026-11-02'}),['2026-10-19','2026-10-26','2026-11-02']));
test('rejects more than 80 sessions',()=>assert.throws(()=>recurrenceDates('2026-10-19',{frequency:'daily',interval:1,endMode:'date',until:'2027-02-01'})));
