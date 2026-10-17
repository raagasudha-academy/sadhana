import { describe, expect, it } from 'vitest';
import { filterFamiliesByLocation, filterStudentsByLocation, sortDirectoryStudents } from '../src/directorySelectors';

type Student = { id: string; name: string; roll: string; location: string; archived: boolean };
const students: Student[] = [
  { id: 'id-3', name: 'Zara', roll: 'RS-10', location: 'Newcastle', archived: false },
  { id: 'id-1', name: 'Anya', roll: 'RS-2', location: 'Carlisle', archived: true },
  { id: 'id-2', name: 'Ben', roll: 'RS-1', location: 'newcastle', archived: false },
];
const roll = (row: Student) => row.roll;

describe('student directory selectors (actual table helpers)', () => {
  it('sorts roll numbers numerically, not lexicographically', () => {
    expect(sortDirectoryStudents(students, 'roll', 'asc', roll).map(s => s.roll)).toEqual(['RS-1','RS-2','RS-10']);
  });
  it('sorts descending', () => {
    expect(sortDirectoryStudents(students, 'roll', 'desc', roll).map(s => s.roll)).toEqual(['RS-10','RS-2','RS-1']);
  });
  it('sorts names both directions', () => {
    expect(sortDirectoryStudents(students, 'name', 'asc', roll).map(s => s.name)).toEqual(['Anya','Ben','Zara']);
    expect(sortDirectoryStudents(students, 'name', 'desc', roll).map(s => s.name)).toEqual(['Zara','Ben','Anya']);
  });
  it('filters locations case-insensitively', () => {
    expect(filterStudentsByLocation(students,'NEWCASTLE',s=>s.location).map(s=>s.id)).toEqual(['id-3','id-2']);
  });
  it('returns all locations and handles no matching location', () => {
    expect(filterStudentsByLocation(students,'All',s=>s.location)).toHaveLength(3);
    expect(filterStudentsByLocation(students,'Leeds',s=>s.location)).toEqual([]);
  });
  it('supports filter followed by sorting and preserves record identity, archived state, and input order', () => {
    const before = students.map(s => ({ ...s }));
    const result = sortDirectoryStudents(filterStudentsByLocation(students,'Newcastle',s=>s.location),'roll','asc',roll);
    expect(result.map(s=>s.id)).toEqual(['id-2','id-3']);
    expect(students).toEqual(before);
    expect(result.every(s => s === students.find(original => original.id === s.id))).toBe(true);
  });
});

describe('family location selection', () => {
  const families=[{id:'f1',location:'Carlisle'},{id:'f2',location:'Newcastle'}];
  it('filters family records without mutation',()=>{
    expect(filterFamiliesByLocation(families,'newcastle',f=>f.location).map(f=>f.id)).toEqual(['f2']);
    expect(families).toHaveLength(2);
  });
});
