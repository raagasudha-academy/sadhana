import {afterEach,expect,it} from 'vitest';
import {pageForView,savedPage} from '../../src/app/pageMemory';
afterEach(()=>sessionStorage.clear());
it('restores the saved admin page after refresh',()=>{
 sessionStorage.setItem('sadhana:page:admin','Website Registrations');
 expect(savedPage('admin')).toBe('Website Registrations');
});
it('preserves shared pages and maps class/student pages between views',()=>{
 expect(pageForView('Messages','teacher','Dashboard')).toBe('Messages');
 expect(pageForView('Families & Students','teacher',null)).toBe('My Students');
 expect(pageForView('My Classes','admin',null)).toBe('Classes & Timetable');
});
it('restores each view without showing unsupported admin pages to teachers',()=>{
 expect(pageForView('Website Registrations','teacher','My Classes')).toBe('My Classes');
 expect(pageForView('Website Registrations','teacher','Website Registrations')).toBe('Dashboard');
 expect(pageForView('Dashboard','admin','Website Registrations')).toBe('Website Registrations');
});
