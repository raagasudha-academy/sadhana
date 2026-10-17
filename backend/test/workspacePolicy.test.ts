import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPages,calendarScopes,filterCalendarResponses,needsAcademySelection } from '../../src/workspacePolicy.ts';
import type { ScheduleInstitution,ScheduleRecord } from '../../src/api/sadhanaClient.ts';
const make=(institution:ScheduleInstitution,recordType:ScheduleRecord['recordType'],name:string):ScheduleRecord=>({
 id:name,recordType,institution,name,programme:'',teacher:'',mode:'',location:'',date:'2026-10-16',startTime:'',endTime:'',timezone:'Europe/London',
});
const all:[{institution:ScheduleInstitution;records:ScheduleRecord[]},{institution:ScheduleInstitution;records:ScheduleRecord[]},{institution:ScheduleInstitution;records:ScheduleRecord[]}] = [
 {institution:'raaga',records:[make('raaga','class-session','Raaga lesson')]},
 {institution:'sruti',records:[make('sruti','class-session','Sruti lesson'),make('raaga','class-session','Unexpected Raaga class')]},
 {institution:'shared',records:[make('shared','holiday','Bank holiday'),make('shared','class-session','Misclassified shared class')]},
];
test('all workspaces have visible navigation beyond Dashboard',()=>{
 assert.ok(adminPages.includes('Classes & Timetable'));
 assert.ok(adminPages.includes('Venues'));
 assert.ok(adminPages.includes('Families & Students'));
 assert.equal(needsAcademySelection('combined','Classes & Timetable'),false);
 assert.equal(needsAcademySelection('combined','Families & Students'),true);
 assert.equal(needsAcademySelection('sruti','Families & Students'),false);
});
test('Sruti calendar excludes Raaga classes but includes shared holidays',()=>{
 assert.deepEqual(calendarScopes('sruti',['raaga','sruti']),['sruti','shared']);
 assert.deepEqual(filterCalendarResponses(all,'sruti',['raaga','sruti']).map(r=>r.name),['Sruti lesson','Bank holiday']);
});
test('Raaga and combined calendar use selected authorised academies only',()=>{
 assert.deepEqual(filterCalendarResponses(all,'raaga',['raaga','sruti']).map(r=>r.name),['Raaga lesson','Bank holiday']);
 assert.deepEqual(filterCalendarResponses(all,'combined',['raaga','sruti']).map(r=>r.name),['Raaga lesson','Sruti lesson','Bank holiday']);
 assert.deepEqual(filterCalendarResponses(all,'combined',['sruti']).map(r=>r.name),['Sruti lesson','Bank holiday']);
 assert.deepEqual(calendarScopes('raaga',['sruti']),[]);
});
