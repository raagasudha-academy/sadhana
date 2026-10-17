import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {calculateSeriesImpact} from '../src/calendarImpact.ts';
import type {ScheduleRecord} from '../src/scheduleModel.ts';
import type {SeriesRule} from '../src/scheduleSeries.ts';
const base={institution:'sruti' as const,classId:'CLASS-TEST',updatedAt:'2026-10-19T00:00:00Z',updatedBy:'test'};
const rules:SeriesRule[]=[{...base,effectiveFrom:'2026-10-20',changes:{teacher:'Teacher A'}},{...base,effectiveFrom:'2026-11-07',changes:{teacher:'Teacher B'}}];
const candidate:SeriesRule={...base,effectiveFrom:'2026-10-31',effectiveUntil:'2026-11-07',changes:{teacher:'Teacher C'}};
function session(date:string,overrides:string[]=[]):ScheduleRecord {return {id:`SESSION-${date}`,recordType:'class-session',classId:'CLASS-TEST',institution:'sruti',version:1,name:'Test',programme:'Music',teacher:'Teacher A',teacherId:undefined,startTime:'10:00',endTime:'11:00',mode:'Online',location:'Online',timezone:'Europe/London',status:'confirmed',allDay:false,date,endDate:date,sessionOverrideFields:overrides} as ScheduleRecord;}
test('preview identifies protected sessions and later conflicting rules',()=>{
 const preview=calculateSeriesImpact([session('2026-10-31',['teacher']),session('2026-11-01'),session('2026-11-07')],rules,candidate);
 assert.equal(preview.totalSessions,3);assert.equal(preview.protectedCount,1);assert.equal(preview.changedCount,1);assert.equal(preview.overlappingRules.length,1);
 assert.deepEqual(preview.changedSessionIds,['SESSION-2026-11-01']);
});
