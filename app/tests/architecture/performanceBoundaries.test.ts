import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const source=(path:string)=>readFileSync(resolve(process.cwd(),'app',path),'utf8');

describe('M7 performance boundaries',()=>{
 it('lazy loads the large role-specific screens with an accessible fallback',()=>{
  const app=source('src/App.tsx');
  for(const component of ['StudentHome','SadhanaMyProfile','TeacherManagement','AdminManagement','AccountAccess','AcademyOperations','PersistentRegistration','LiveDashboard','WebsiteRegistrations']){
   expect(app).toContain(`const ${component} = lazy(() => import(`);
  }
  expect(app).toContain('<Suspense');
  expect(app).toContain('role="status">Loading section…</p>');
 });
 it('does not start an embedded detail request while the initial family fetch is active',()=>{
  const controller=source('src/features/learning/useStudentPortalController.ts');
  expect(controller).toContain('if(loading || !embedded || !selectedStudentId || detailLoading) return;');
  expect(controller).toContain('if(selectedStudentId!==activeId) void loadDetail(selectedStudentId);');
 });
 it('preserves the explicit parent-owned selected student',()=>{
  const controller=source('src/features/learning/useStudentPortalController.ts');
  expect(controller).toContain('Embedded View As selection is owned by App');
  expect(controller).not.toContain('onStudentChange?.(initial.id)');
 });
});
