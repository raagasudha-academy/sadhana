import assert from 'node:assert/strict';
import test from 'node:test';
import {canReadStudent,canReviewAccess,isStudentRecordId,isAccountSubject} from '../src/accessRules.ts';
const student='STUDENT-12345678-1234-1234-1234-123456789abc';
test('only approved exact student and institution links can read records',()=>{
 assert.equal(canReadStudent({studentId:student,institution:'sruti',status:'approved'},student,'sruti'),true);
 for(const status of ['pending','rejected','revoked',''])assert.equal(canReadStudent({studentId:student,institution:'sruti',status},student,'sruti'),false);
 assert.equal(canReadStudent({studentId:student,institution:'sruti',status:'approved'},student,'raaga'),false);
 assert.equal(canReadStudent(null,student,'sruti'),false);
});
test('only authorised academy administrators can review',()=>{
 assert.equal(canReviewAccess(['sruti'],'sruti'),true);
 assert.equal(canReviewAccess(['sruti'],'raaga'),false);
 assert.equal(canReviewAccess([],'sruti'),false);
});
test('external identifiers require stable ID shapes',()=>{
 assert.equal(isStudentRecordId(student),true);
 assert.equal(isStudentRecordId('Tanisha Kanakam'),false);
 assert.equal(isAccountSubject('12345678-1234-1234-1234-123456789abc'),true);
 assert.equal(isAccountSubject('someone@example.com'),false);
});
