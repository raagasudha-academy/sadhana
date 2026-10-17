import {describe,it,expect} from 'vitest';
import {teacherIdentityFailureMessage} from '../src/teacherIdentityMessages';
describe('teacher identity error handling',()=>{
 it('identifies a missing backend endpoint',()=>expect(teacherIdentityFailureMessage(new Error('HTTP 404'))).toContain('running API'));
 it('does not recommend opening class access on 403',()=>expect(teacherIdentityFailureMessage(new Error('HTTP 403'))).toContain('no classes are shown'));
 it('keeps unexpected failures fail-closed',()=>expect(teacherIdentityFailureMessage(new Error('Network error'))).toContain('no classes are shown'));
});
