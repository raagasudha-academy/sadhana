import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTeacherComment} from '../src/practiceFeedback.ts';
test('teacher feedback accepts trimmed comments',()=>assert.equal(validateTeacherComment({comment:'  Good progress!  '}),'Good progress!'));
test('teacher feedback rejects empty content',()=>assert.throws(()=>validateTeacherComment({comment:'   '})));
test('teacher feedback rejects unexpected fields',()=>assert.throws(()=>validateTeacherComment({comment:'OK',studentId:'STUDENT-1'})));
test('teacher feedback rejects oversized text',()=>assert.throws(()=>validateTeacherComment({comment:'a'.repeat(1001)})));
