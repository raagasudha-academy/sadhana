import test from 'node:test';
import assert from 'node:assert/strict';
import {typeOf,safeRelation,storageReferences,isApprovalReady} from '../../scripts/crossSystemReviewCore.mjs';
test('HOLD record types are strictly classified',()=>{
 assert.equal(typeOf({kind:'HOLD',table:'admin',PK:'ACCESS#raaga#sub',SK:'STUDENT#id'}),'guardian-access');
 assert.equal(typeOf({kind:'HOLD',table:'students',PK:'OPS#GLOBAL#WEB_IMPORT',SK:'IDENTITY#abc'}),'website-identity-mapping');
 assert.equal(typeOf({kind:'HOLD',table:'learning',PK:'OPS#sruti#HOMEWORK_MATERIAL',SK:'ITEM#x'}),'homework-material');
});
test('test cohort matching cannot infer ownership without evidence',()=>{
 assert.equal(safeRelation({studentId:'a'},new Set(['b']),'f'),false);
 assert.equal(safeRelation({familyId:'f'},new Set(['b']),'f'),true);
 assert.equal(safeRelation({classId:'x'},new Set(['b']),'f'),null);
});
test('media keys are not invented',()=>{
 assert.deepEqual(storageReferences({fileName:'photo.jpg'},'test-bucket'),[]);
 assert.equal(storageReferences({s3Key:'students/test.jpg'},'test-bucket').length,1);
});
test('manual review is not automatic approval',()=>assert.equal(isApprovalReady([{decision:'HOLD'}]),false));
