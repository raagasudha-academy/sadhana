import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const teacher=readFileSync('src/TeacherWorkspace.tsx','utf8');
const materials=readFileSync('src/HomeworkMaterials.tsx','utf8');
const media=readFileSync('backend/src/homeworkMediaPolicy.ts','utf8');
describe('v13.6.1 homework scope regression',()=>{
 it('keeps upload controls in the teacher form without published-card materials panel',()=>{
  expect(teacher).toContain('Attach homework materials');
  expect(teacher.indexOf('Attach homework materials')).toBeLessThan(teacher.indexOf('Publish homework'));
  expect(teacher).not.toContain('<TeacherHomeworkMaterials');
 });
 it('does not offer document upload',()=>{
  expect(materials).not.toContain('Document (soon)');
  expect(teacher).not.toContain('accept="application/pdf"');
 });
 it('retains existing media policy and assignment identity after publishing',()=>{
  expect(media).toContain('5_000_000');
   expect(media).toContain('image/jpeg');
   expect(media).toContain('image/png');
   expect(media).toContain('image/webp');
   expect(media).toContain('mimes.length<=3');
   expect(media).not.toContain("'video/mp4'");
   expect(media).not.toContain("'audio/mp4'");
  expect(teacher).toContain('setEditingHomework({id,version})');
 });
});
