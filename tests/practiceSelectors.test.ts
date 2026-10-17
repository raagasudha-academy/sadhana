import {describe,it,expect} from 'vitest';
import {filterPracticeEntries,practiceTotals} from '../src/practiceSelectors';
const entries=[
 {id:'b',studentId:'one',date:'2026-10-20',topic:'Raga',minutes:20},
 {id:'c',studentId:'two',date:'2026-10-21',topic:'Chanting',minutes:15},
 {id:'a',studentId:'one',date:'2026-10-21',topic:'Raga',minutes:10},
];
describe('teacher practice review selectors',()=>{
 it('sorts newest first and uses stable IDs for ties',()=>expect(filterPracticeEntries(entries,'','').map(x=>x.id)).toEqual(['a','c','b']));
 it('filters by student identity rather than duplicate names',()=>expect(filterPracticeEntries(entries,'two','').map(x=>x.id)).toEqual(['c']));
 it('matches topic and date case insensitively',()=>expect(filterPracticeEntries(entries,'','RAGA').map(x=>x.id)).toEqual(['a','b']));
 it('does not infer practice from missing entries',()=>expect(practiceTotals([])).toEqual({entries:0,minutes:0,students:0}));
 it('counts submitted minutes and distinct students',()=>expect(practiceTotals(entries)).toEqual({entries:3,minutes:45,students:2}));
});
