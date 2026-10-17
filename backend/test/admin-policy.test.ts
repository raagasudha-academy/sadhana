import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canManageAdmins,requireAdminManager,readInstitution,validateInvite,validateAccessChange} from '../src/adminPolicy.ts';

const both = {sub:'trusted-sub','cognito:groups':['raagasudha-admin','sruti-admin']};

test('configured super admin requires exact sub and BOTH administrator groups',()=>{
  assert.equal(canManageAdmins(both,'trusted-sub'),true);
  assert.equal(canManageAdmins(both,''),false);
  assert.equal(canManageAdmins(both,'different'),false);
  assert.equal(canManageAdmins({sub:'trusted-sub','cognito:groups':['sruti-admin']},'trusted-sub'),false);
});
test('viewer and ordinary admin cannot change admin roles',()=>{
  assert.throws(()=>requireAdminManager({sub:'user','cognito:groups':['sruti-viewer']},'user'),(e:any)=>e.status===403);
  assert.throws(()=>requireAdminManager({sub:'user','cognito:groups':['sruti-admin']},'user'),(e:any)=>e.status===403);
});
test('new invitation validates and normalizes values',()=>{
  assert.deepEqual(validateInvite({email:' TEST@EXAMPLE.org ',displayName:'Mrs   Admin',institution:'sruti'}),{
    email:'test@example.org',displayName:'Mrs Admin',institution:'sruti'});
  assert.throws(()=>validateInvite({email:'bad',displayName:'User',institution:'sruti'}));
  assert.throws(()=>validateInvite({email:'me@example.org',displayName:'User',institution:'combined'}));
  assert.throws(()=>validateInvite({email:'me@example.org',displayName:'User',institution:'sruti',groups:['superadmin']}));
});
test('existing account role change needs explicit grant boolean',()=>{
  assert.deepEqual(validateAccessChange({username:'existing',institution:'raaga',grant:false}),{username:'existing',institution:'raaga',grant:false});
  assert.throws(()=>validateAccessChange({username:'existing',institution:'sruti',grant:'false'}));
  assert.throws(()=>readInstitution('combined'));
});
