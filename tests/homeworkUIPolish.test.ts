import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync('src/v1361HomeworkIcons.css','utf8');
describe('v13.6.2 homework UI polish',()=>{
 it('scopes teacher and student visual changes',()=>{expect(css).toContain('.sv1276-teacher-homework');expect(css).toContain('.sv1278-homework');});
 it('styles primary and secondary controls consistently',()=>{expect(css).toContain('button.sadhana-hw-primary');expect(css).toContain('.sv1278-editor footer button:last-child');});
 it('groups published cards and review responses responsively',()=>{expect(css).toContain('.sv1276-hw-records{display:grid');expect(css).toContain('@media(max-width:640px)');});
});
