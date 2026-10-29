import test from 'node:test';
import assert from 'node:assert/strict';
import {intakePath,intakeQuery} from '../src/websiteRegistrationGateway.ts';
test('registration paths are fixed and identifiers cannot inject paths',()=>{
 assert.equal(intakePath(),' /admin/registrations'.trim());
 assert.equal(intakePath('RS-2026-A1B2C3'),'/admin/registrations/RS-2026-A1B2C3');
 assert.equal(intakePath('RS-1','PERSON-2'),'/admin/registrations/RS-1/photos/PERSON-2');
 for(const id of ['../escape','?status=all','abc/def','', 'hello%2Fworld']){
  if(id==='')continue;
  assert.throws(()=>intakePath(id));
 }
});
test('list query only passes allowlisted filters and enforces page bounds',()=>{
 assert.equal(intakeQuery({status:'pending',limit:'10',locationId:'LOC-NEWCASTLE'}).toString(),
 'status=pending&locationId=LOC-NEWCASTLE&limit=10');
 assert.throws(()=>intakeQuery({limit:'1000'}));
 assert.throws(()=>intakeQuery({limit:'-1'}));
});
