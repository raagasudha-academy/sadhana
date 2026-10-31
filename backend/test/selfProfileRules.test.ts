import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNameUpdate} from '../src/selfProfile.ts';
test('self profile accepts names only and rejects contact/authorization fields',()=>{
 assert.deepEqual(validateNameUpdate({name:'Jane Doe',givenName:'Jane',familyName:'Doe'}),{name:'Jane Doe',givenName:'Jane',familyName:'Doe'});
 for(const x of [{name:'Jane',givenName:'Jane',familyName:'D',email:'hacker@example.com'},{name:'J',givenName:'J',familyName:'D',phone:'+44123'}, {name:'',givenName:'J',familyName:'D'}, {name:'J',givenName:'J',familyName:'D',subject:'other'}])assert.throws(()=>validateNameUpdate(x));
});
