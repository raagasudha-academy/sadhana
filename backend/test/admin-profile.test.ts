import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAdminProfile,canManageAdmins,parseAdminTitle} from '../src/adminPolicy.ts';

test('accepts a validated name title without changing permissions',()=>{
  assert.deepEqual(validateAdminProfile({username:'mohana',title:'Mrs',firstName:'Mohana',lastName:'Kamanooru'}),{
    username:'mohana',title:'Mrs',firstName:'Mohana',lastName:'Kamanooru'
  });
  assert.equal(parseAdminTitle('Mrs Mohana Kamanooru'),'Mrs');
  assert.equal(parseAdminTitle('Dr. Aishwarya Amarnath'),'Dr');
  assert.equal(parseAdminTitle('Mohana Kamanooru'),'');
});
test('rejects unknown title, legacy picture paths and role changes',()=>{
  for(const extra of [{title:'SuperAdmin'},{photo:'teachers/mohana-kamanooru.png'},{grant:true}])
    assert.throws(()=>validateAdminProfile({username:'mohana',firstName:'Mohana',lastName:'Kamanooru',title:'',...extra}));
  assert.throws(()=>validateAdminProfile({username:'mohana',title:'Mrs',firstName:'',lastName:'Kamanooru'}));
});
test('super-admin guard remains independent from profile changes',()=>{
  assert.equal(canManageAdmins({sub:'unknown'} as any,'known'),false);
});
