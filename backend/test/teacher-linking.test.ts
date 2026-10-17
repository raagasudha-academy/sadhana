import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {matchesTeacherName,normalizedTeacherName,suggestedTeacherIds} from '../src/teacherNameMatch.ts';
import {parseSeriesChange,projectSeriesRecord} from '../src/scheduleSeries.ts';
import type {ScheduleRecord} from '../src/scheduleModel.ts';
const id='TEACHER-11111111-1111-4111-8111-111111111111';
const master:ScheduleRecord={id:'CLASS-SRUTI-NEWCASTLE-VEDANTA',recordType:'class',institution:'sruti',name:'Newcastle Vedanta',programme:'Vedanta',teacher:'',mode:'In Person',location:'Newcastle',startTime:'10:00',endTime:'11:00',timezone:'Europe/London',version:3};
test('matches honorifics and aliases, not unrelated teacher',()=>{
 assert.equal(normalizedTeacherName('Mr Srikailash Venkitadri'),normalizedTeacherName('Srikailash Venkitadri'));
 assert.equal(matchesTeacherName('Mr Srikailash Venkitadri',{displayName:'Mr Srikailash Venkitadri'}),true);
 assert.deepEqual(suggestedTeacherIds('Mrs Praveena Srikailash',[{id,displayName:'Mrs Praveena Srikailash',aliases:[],active:true}]),[id]);
 assert.equal(matchesTeacherName('Someone Else',{displayName:'Mrs Praveena Srikailash'}),false);
});
test('linked future rule never projects into old sessions',()=>{
 const rule={institution:'sruti' as const,classId:master.id,effectiveFrom:'2026-10-24',changes:{teacher:'Mr Srikailash Venkitadri',teacherId:id},updatedAt:'',updatedBy:''};
 const older:ScheduleRecord={...master,id:'SESSION-OLD',recordType:'class-session',date:'2026-10-17',endDate:'2026-10-17',status:'confirmed',classId:master.id};
 const future={...older,id:'SESSION-FUTURE',date:'2026-11-07',endDate:'2026-11-07'};
 assert.equal(projectSeriesRecord(older,[rule]).teacherId,undefined);
 assert.equal(projectSeriesRecord(future,[rule]).teacherId,id);
 assert.equal(projectSeriesRecord(future,[rule]).teacher,'Mr Srikailash Venkitadri');
});
test('series parse rejects bare teacherId',()=>{
 assert.throws(()=>parseSeriesChange({expectedVersion:3,effectiveFrom:'2026-10-24',changes:{teacherId:id}},master,'2026-10-18'));
});
test('a later name-only rule clears a stale linked identity',()=>{
 const initial:ScheduleRecord={...master,teacher:'Mrs Praveena Srikailash',teacherId:id};
 const changed={institution:'sruti' as const,classId:initial.id,effectiveFrom:'2026-11-01',changes:{teacher:'Dr Uma Geethanath'},updatedAt:'',updatedBy:''};
 const projected=projectSeriesRecord(initial,[changed],'2026-11-02');
 assert.equal(projected.teacher,'Dr Uma Geethanath');
 assert.equal(projected.teacherId,undefined);
});
test('a one-off session teacher override never inherits a series teacher identity',()=>{
 const rule={institution:'sruti' as const,classId:master.id,effectiveFrom:'2026-10-24',changes:{teacher:'Mr Srikailash Venkitadri',teacherId:id},updatedAt:'',updatedBy:''};
 const session:ScheduleRecord={...master,id:'SESSION-ONEOFF',recordType:'class-session',classId:master.id,date:'2026-11-07',endDate:'2026-11-07',status:'confirmed',teacher:'Substitute',sessionOverrideFields:['teacher']};
 const projected=projectSeriesRecord(session,[rule]);
 assert.equal(projected.teacher,'Substitute');
 assert.equal(projected.teacherId,undefined);
});
