import {describe,it,expect} from 'vitest';
import {activeClassIds,visibleMasterClasses,visibleDatedSessions,enrolledStudentIds,eligibleStudentIds} from '../src/operationsSelectors';
const e=[{id:'e1',studentId:'s1',classId:'c1',startDate:'2026-01-01',endDate:'',archived:false},{id:'e2',studentId:'s2',classId:'c1',startDate:'2026-01-01',endDate:'2026-09-01',archived:false},{id:'e3',studentId:'s3',classId:'c2',startDate:'2026-01-01',archived:true}];
const schedule=[{id:'c1',name:'Class 1',recordType:'class'},{id:'c2',name:'Class 2',recordType:'class'},{id:'c3',name:'Old',recordType:'class',lifecycleStatus:'archived'},{id:'d1',recordType:'class-session',classId:'c1',date:'2026-10-22'},{id:'d2',recordType:'class-session',classId:'c2',date:'2026-10-22'},{id:'x',recordType:'special-event',eventKind:'class',classId:'c1',date:'2026-10-22'},{id:'concert',recordType:'special-event',eventKind:'concert',classId:'c1'}];
describe('academy operations selectors',()=>{
 it('limits teacher master classes to returned active enrolments',()=>{expect(visibleMasterClasses(schedule,e,true).map(c=>c.id)).toEqual(['c1']);expect(visibleMasterClasses(schedule,e,false).map(c=>c.id)).toEqual(['c1','c2']);});
 it('limits teacher sessions and accepts class compensation sessions only',()=>{expect(visibleDatedSessions(schedule,e,true).map(c=>c.id)).toEqual(['d1','x']);expect(visibleDatedSessions(schedule,e,false).map(c=>c.id)).toEqual(['d1','d2','x']);});
 it('excludes archived enrolments and respects date ranges for attendance',()=>{expect([...enrolledStudentIds(e,'c1','2026-10-22')]).toEqual(['s1']);expect([...enrolledStudentIds(e,'c1','2026-08-01')]).toEqual(['s1','s2']);expect([...enrolledStudentIds(e,'c2')]).toEqual([]);});
 it('prevents cross-class student selection for attendance/practice',()=>{expect([...eligibleStudentIds(e,'c1','2026-10-22')]).toEqual(['s1']);expect([...eligibleStudentIds(e,'c2')]).toEqual([]);});
 it('preserves identities and does not mutate source records',()=>{const before=JSON.stringify(e);expect([...activeClassIds(e)]).toEqual(['c1']);visibleMasterClasses(schedule,e,true);enrolledStudentIds(e,'c1');expect(JSON.stringify(e)).toBe(before);});
});
