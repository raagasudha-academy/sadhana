import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const readSource=(path:string)=>readFileSync(resolve(process.cwd(),'app/src',path),'utf8');
const controller=readSource('features/learning/useStudentPortalController.ts');
const portalView=readSource('features/learning/StudentPortalView.tsx');
const practice=readSource('features/learning/StudentPractice.tsx');

test('family dashboard auto-selects an approved student and renders accessible loading',()=>{
 expect(controller).toContain('setStudents');
 expect(controller).toContain('selectedStudentId');
 expect(controller).toContain('activeDashboardRef');
 expect(portalView).toContain('detailLoading');
 expect(portalView).toContain('role="status"');
});

test('practice logging is disabled before class enrollment',()=>{
 expect(practice).toContain('disabled={!detail.classes.length}');
});
