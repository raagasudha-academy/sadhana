import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSeriesChange,projectSeriesRecord,seriesSK,todayLondon,validateSeriesCandidate} from '../src/scheduleSeries.ts';
import type {ScheduleRecord} from '../src/scheduleModel.ts';
const master:ScheduleRecord={id:'CLASS-RAAGA-ONLINE-MON-1000',recordType:'class',institution:'raaga',name:'Carnatic Music — Monday Morning',programme:'Carnatic Music',teacher:'Praveena',mode:'Online',location:'Online',startTime:'10:00',endTime:'11:00',timezone:'Europe/London',version:3};
const session=(date:string):ScheduleRecord=>({...master,id:`EVT-${date}`,recordType:'class-session',classId:master.id,date,endDate:date,status:'confirmed'});
const rule=(date:string,changes:any)=>({classId:master.id,institution:'raaga' as const,effectiveFrom:date,changes,updatedAt:'2026-10-16T00:00:00Z',updatedBy:'admin'});
test('one date changes only that and subsequent sessions, never past',()=>{
 const rules=[rule('2026-10-26',{teacher:'Teacher B',startTime:'12:00',endTime:'13:00'})];
 assert.equal(projectSeriesRecord(session('2026-10-19'),rules).teacher,'Praveena');
 assert.equal(projectSeriesRecord(session('2026-10-26'),rules).startTime,'12:00');
 assert.equal(projectSeriesRecord(session('2026-11-02'),rules).teacher,'Teacher B');
 assert.equal(projectSeriesRecord(master,rules,'2026-10-28').teacher,'Teacher B');
 assert.equal(master.teacher,'Praveena');
});
test('individual session exceptions take precedence over series',()=>{
 const rec={...session('2026-11-02'),teacher:'Substitute',sessionOverrideFields:['teacher']};
 const v=projectSeriesRecord(rec,[rule('2026-10-26',{teacher:'Teacher B',startTime:'12:00',endTime:'13:00'})]);
 assert.equal(v.teacher,'Substitute'); assert.equal(v.startTime,'12:00');
});
test('successive partial rules compose instead of reverting unrelated changes',()=>{
 const rules=[rule('2026-10-26',{startTime:'11:00',endTime:'12:00'}),rule('2026-11-02',{teacher:'Teacher B'})];
 const future=projectSeriesRecord(session('2026-11-09'),rules);
 assert.equal(future.teacher,'Teacher B');assert.equal(future.startTime,'11:00');
});
test('deny backdated, malformed, unauthorized or invalid time changes',()=>{
 assert.throws(()=>parseSeriesChange({effectiveFrom:'2026-10-15',expectedVersion:3,changes:{teacher:'X'}},master,'2026-10-16'));
 assert.throws(()=>parseSeriesChange({effectiveFrom:'2026-10-26',expectedVersion:2,changes:{teacher:'X'}},master,'2026-10-16'));
 assert.throws(()=>parseSeriesChange({effectiveFrom:'2026-10-26',expectedVersion:3,changes:{date:'2026-10-27'}},master,'2026-10-16'));
 assert.throws(()=>validateSeriesCandidate(master,[],rule('2026-10-26',{startTime:'12:00'})));
});
test('series rules use separate keys and preserve DST-independent UK dates',()=>{
 assert.equal(seriesSK(master.id,'2026-10-26'),`CLASS#${master.id}#FROM#2026-10-26`);
 assert.equal(todayLondon(new Date('2026-10-25T00:30:00Z')),'2026-10-25');
 assert.equal(todayLondon(new Date('2026-10-25T23:30:00Z')),'2026-10-25');
});
