import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationContactPhone} from '../src/registrationContactPhone.ts';
test('uses valid registered international phone numbers',()=>{
 assert.equal(registrationContactPhone('+447809218663'),'+447809218663');
 assert.equal(registrationContactPhone(' +44 7809 218663 '),'+447809218663');
});
test('does not invent phones from missing or invalid input',()=>{
 for(const value of [undefined,null,'','07809218663','+00012345678','+44123','+44<script>123456789</script>'])
   assert.equal(registrationContactPhone(value),undefined);
});
