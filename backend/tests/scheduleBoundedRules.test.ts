import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {parseSeriesChange,projectSeriesRecord} from '../src/scheduleSeries.ts';
import type {ScheduleRecord} from '../src/scheduleModel.ts';

const master={id:'CLASS-TEST',recordType:'class',institution:'sruti',version:3,
 name:'Test class',programme:'Music',teacher:'Teacher A',startTime:'10:00',endTime:'11:00',
 mode:'Online',location:'Online',timezone:'Europe/London',status:'confirmed',allDay:false,
 date:'2026-10-25',endDate:'2026-10-25'} as ScheduleRecord;
const session={...master,id:'SESSION-TEST',recordType:'class-session',classId:master.id,date:'2026-11-08',endDate:'2026-11-08'} as ScheduleRecord;
const onDate=(date:string)=>({ ...session,date,endDate:date }) as ScheduleRecord;
const base={institution:'sruti' as const,classId:master.id,updatedAt:'2026-10-19T00:00:00Z',updatedBy:'test'};
const ongoing={...base,effectiveFrom:'2026-10-20',changes:{teacher:'Teacher B'}};
const bounded={...base,effectiveFrom:'2026-11-01',effectiveUntil:'2026-11-07',changes:{teacher:'Teacher C'}};

test('bounded rule accepts inclusive end date and rejects reversed dates',()=>{
 const good=parseSeriesChange({effectiveFrom:'2026-11-01',effectiveUntil:'2026-11-07',expectedVersion:3,changes:{teacher:'Teacher C'}},master,'2026-10-19');
 assert.equal(good.effectiveUntil,'2026-11-07');
 assert.throws(()=>parseSeriesChange({effectiveFrom:'2026-11-07',effectiveUntil:'2026-11-01',expectedVersion:3,changes:{teacher:'Teacher C'}},master,'2026-10-19'));
});
test('bounded rule ends inclusively; previous ongoing rule resumes',()=>{
 const rules=[ongoing,bounded];
 assert.equal(projectSeriesRecord(onDate('2026-10-31'),rules).teacher,'Teacher B');
 assert.equal(projectSeriesRecord(onDate('2026-11-01'),rules).teacher,'Teacher C');
 assert.equal(projectSeriesRecord(onDate('2026-11-07'),rules).teacher,'Teacher C');
 assert.equal(projectSeriesRecord(onDate('2026-11-08'),rules).teacher,'Teacher B');
});
test('later recurring rule takes priority during and after bounded range',()=>{
 const later={...base,effectiveFrom:'2026-11-05',changes:{teacher:'Teacher D'}};
 assert.equal(projectSeriesRecord(onDate('2026-11-06'),[ongoing,bounded,later]).teacher,'Teacher D');
 assert.equal(projectSeriesRecord(onDate('2026-11-08'),[ongoing,bounded,later]).teacher,'Teacher D');
});
test('session-specific teacher override is preserved',()=>{
 const overridden={...onDate('2026-11-03'),teacher:'Substitute',sessionOverrideFields:['teacher']} as ScheduleRecord;
 assert.equal(projectSeriesRecord(overridden,[ongoing,bounded]).teacher,'Substitute');
});
