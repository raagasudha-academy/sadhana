import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRaagaRegistration} from '../src/m10RaagaImportSource.mjs';

test('known external RAAGASUDHA label maps to canonical raaga',()=>{
 const input={institution:'RAAGASUDHA',registrationId:'RS-123',reviewStatus:'approved',students:[]};
 const result=canonicalRaagaRegistration(input);
 assert.equal(result.institution,'raaga');assert.equal(result.reviewStatus,'approved');
 assert.equal(input.institution,'RAAGASUDHA');
});
test('unknown institution is never silently converted',()=>{
 for(const institution of ['sruti','OTHER','RAAGASUDHA-other','Raagasudha'])
  assert.equal(canonicalRaagaRegistration({institution}).institution,institution);
});
