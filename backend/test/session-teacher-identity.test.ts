import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleChanges} from '../src/scheduleModel.ts';
import {projectSeriesRecord} from '../src/scheduleSeries.ts';
import type {ScheduleRecord} from '../src/scheduleModel.ts';
const id='TEACHER-11111111-1111-4111-8111-111111111111';
const raw:ScheduleRecord={id:'EVT-12345678',recordType:'class-session',institution:'sruti',classId:'CLASS-SRUTI-NEWCASTLE-VEDANTA',name:'Vedanta',programme:'Vedanta',teacher:'',mode:'in-person',location:'Newcastle',date:'2026-10-17',endDate:'2026-10-17',startTime:'10:00',endTime:'11:00',status:'confirmed',timezone:'Europe/London',version:1};
test('One-off edits validate and retain registered teacher ID',()=>{
 const updated=scheduleChanges(raw,{teacher:'Mr Srikailash Venkitadri',teacherId:id});
 assert.equal(updated.teacherId,id);
});
test('One-off teacher identity survives later series rules',()=>{
 const changed={...raw,teacher:'Mr Srikailash Venkitadri',teacherId:id,sessionOverrideFields:['teacher','teacherId']};
 const result=projectSeriesRecord(changed,[{institution:'sruti',classId:raw.classId!,effectiveFrom:'2026-10-01',changes:{teacher:'Another Teacher',teacherId:'TEACHER-22222222-2222-4222-8222-222222222222'},updatedAt:'',updatedBy:''}]);
 assert.equal(result.teacher,'Mr Srikailash Venkitadri');assert.equal(result.teacherId,id);
});
test('Legacy one-off teacher name without ID never inherits a series identity',()=>{
 const changed={...raw,teacher:'Guest Teacher',sessionOverrideFields:['teacher']};
 const result=projectSeriesRecord(changed,[{institution:'sruti',classId:raw.classId!,effectiveFrom:'2026-10-01',changes:{teacher:'Regular Teacher',teacherId:id},updatedAt:'',updatedBy:''}]);
 assert.equal(result.teacher,'Guest Teacher');assert.equal(result.teacherId,undefined);
});
