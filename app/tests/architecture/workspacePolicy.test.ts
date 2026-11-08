import {test, expect} from 'vitest';
import {adminPages, calendarScopes, filterCalendarResponses, needsAcademySelection} from '../../src/workspacePolicy';
import type {ScheduleInstitution, ScheduleRecord} from '../../src/api/sadhanaClient';

const make=(institution:ScheduleInstitution,recordType:ScheduleRecord['recordType'],name:string):ScheduleRecord=>({
 id:name,recordType,institution,name,programme:'',teacher:'',mode:'',location:'',date:'2026-10-16',startTime:'',endTime:'',timezone:'Europe/London',
});

const responses:[
 {institution:ScheduleInstitution;records:ScheduleRecord[]},
 {institution:ScheduleInstitution;records:ScheduleRecord[]},
 {institution:ScheduleInstitution;records:ScheduleRecord[]},
] = [
 {institution:'raaga',records:[make('raaga','class-session','Raaga lesson')]},
 {institution:'sruti',records:[make('sruti','class-session','Sruti lesson'),make('raaga','class-session','Unexpected Raaga class')]},
 {institution:'shared',records:[make('shared','holiday','Bank holiday'),make('shared','class-session','Misclassified shared class')]},
];

test('all workspaces have visible navigation beyond Dashboard',()=>{
 expect(adminPages).toContain('Classes & Timetable');
 expect(adminPages).toContain('Venues');
 expect(adminPages).toContain('Families & Students');
 expect(needsAcademySelection('combined','Classes & Timetable')).toBe(false);
 expect(needsAcademySelection('combined','Families & Students')).toBe(true);
 expect(needsAcademySelection('sruti','Families & Students')).toBe(false);
});

test('Sruti calendar excludes Raaga classes but includes shared holidays',()=>{
 expect(calendarScopes('sruti',['raaga','sruti'])).toEqual(['sruti','shared']);
 expect(filterCalendarResponses(responses,'sruti',['raaga','sruti']).map(record=>record.name)).toEqual(['Sruti lesson','Bank holiday']);
});

test('Raaga and combined calendars use selected authorised academies only',()=>{
 expect(filterCalendarResponses(responses,'raaga',['raaga','sruti']).map(record=>record.name)).toEqual(['Raaga lesson','Bank holiday']);
 expect(filterCalendarResponses(responses,'combined',['raaga','sruti']).map(record=>record.name)).toEqual(['Raaga lesson','Sruti lesson','Bank holiday']);
 expect(filterCalendarResponses(responses,'combined',['sruti']).map(record=>record.name)).toEqual(['Sruti lesson','Bank holiday']);
 expect(calendarScopes('raaga',['sruti'])).toEqual([]);
});
