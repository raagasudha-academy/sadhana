import test from 'node:test';
import assert from 'node:assert/strict';
import {photoKey,storedPhotoIsValid,validatePhotoPayload,requireTeacherPhotoPermission} from '../src/profilePhotoRules.ts';

const sub='00aa0000-1111-2222-3333-abcdef987654';
function tinyJpeg(width:number,height:number):Buffer {
  // Minimal marker structure sufficient for the server-side dimension validation.
  const sof=Buffer.from([0xff,0xc0,0,17,8,height>>8,height&255,width>>8,width&255,3,1,0x11,0,2,0x11,0,3,0x11,0]);
  return Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0,4,0,0]),sof,Buffer.alloc(24,0),Buffer.from([0xff,0xd9])]);
}
test('object keys are scoped exclusively to verified Cognito subjects',()=>{
  assert.equal(photoKey(sub),`profiles/${sub}.jpg`);
  assert.throws(()=>photoKey('../other-user'));
  assert.equal(storedPhotoIsValid(`s3:profiles/${sub}.jpg`,sub),true);
  assert.equal(storedPhotoIsValid('s3:profiles/other.jpg',sub),false);
});
test('accepts a small, dimension-limited JPEG',()=>{
  const data=tinyJpeg(512,512);
  assert.deepEqual(validatePhotoPayload({base64:data.toString('base64')}),data);
});
test('blocks unexpected fields, spoofed formats and excessive dimensions',()=>{
  const valid=tinyJpeg(512,512).toString('base64');
  assert.throws(()=>validatePhotoPayload({base64:valid,grant:true}));
  assert.deepEqual(validatePhotoPayload({base64:valid,teacherId:'TEACHER-00000000-0000-0000-0000-000000000000'}),tinyJpeg(512,512));
  assert.throws(()=>validatePhotoPayload({base64:Buffer.from('not a jpeg').toString('base64')}));
  assert.throws(()=>validatePhotoPayload({base64:tinyJpeg(2000,2000).toString('base64')}));
  assert.throws(()=>validatePhotoPayload({base64:Buffer.alloc(221*1024).toString('base64')}));
});

test('teacher-photo upload requires admin membership for every assigned institution',()=>{
  const teacher={institutions:['sruti','raaga'],cognitoSub:sub};
  assert.throws(()=>requireTeacherPhotoPermission(teacher,{sub:'other','cognito:groups':['sruti-admin']}),
    (error:any)=>error.status===403);
  assert.equal(requireTeacherPhotoPermission(teacher,{sub:'admin','cognito:groups':['sruti-admin','raagasudha-admin']}),sub);
  assert.throws(()=>requireTeacherPhotoPermission({institutions:['sruti'],cognitoSub:''},{sub:'admin','cognito:groups':['sruti-admin']}),
    (error:any)=>error.status===409);
  assert.throws(()=>requireTeacherPhotoPermission({institutions:['combined'],cognitoSub:sub},{sub:'admin','cognito:groups':['sruti-admin']}),
    (error:any)=>error.status===409);
});
