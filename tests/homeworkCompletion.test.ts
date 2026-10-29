import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const student=readFileSync('src/StudentHome.tsx','utf8');
describe('v13.7.3 homework completion UX',()=>{
 it('respects the reviewed submission lock',()=>{
  expect(student).toContain('reviewedAt?:string|null');
  expect(student).toContain("submission.reviewedAt?' · Reviewed · Read-only'");
  expect(student).toContain('disabled={!submissionEditable||submissionBusy}');
 });
 it('retains draft and submit actions',()=>{
  expect(student).toContain("saveAssignment('draft')");
  expect(student).toContain("saveAssignment('submitted')");
 });
});
