import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSrutiSubmission,newSrutiIntakeRecord,toApprovedM9Registration} from '../srutiIntakeCore.mjs';
import {prepareWebsiteImport} from '../websiteImportCore.mjs';
const guardian={firstName:'Test',lastName:'Guardian',email:'test@example.org',phone:'07123456789',relationship:'Parent',address1:'1 Test Street',address2:'',city:'Durham',postcode:'DH1 1AA',emergencyName:'Emergency Contact',emergencyPhone:'+447700900123',additionalNotes:''};
const student=(firstName,applicantType)=>({firstName,lastName:'Guardian',dateOfBirth:'2012-05-21',applicantType,gender:'',school:'School',interests:'Vedam',experience:'Gayatri',allergies:'None',medicalNotes:''});
const input=(registrationType,students)=>({institution:'sruti',registrationType,guardian,students,consents:{registration:true,photography:false}});
for(const [kind,kids] of [['self',[student('Test','self')]],['child',[student('Child','child')]],['both',[student('Test','self'),student('Child','child')]]]){
 test(kind+' maps to M9 without guardian approval',()=>{
  const normalized=validateSrutiSubmission(input(kind,kids));
  const source=newSrutiIntakeRecord(normalized,'2026-11-04T00:00:00Z','SR-TEST'+kind);
  assert.equal(source.reviewStatus,'pending');
  assert.throws(()=>toApprovedM9Registration(source));
  source.reviewStatus='approved';
  const ready=toApprovedM9Registration(source);
  const plan=prepareWebsiteImport(ready,'sruti','admin-sub',{family:0,student:0});
  assert.equal(plan.studentMappings.length,kids.length);
  assert.equal(plan.pendingGuardianLinks,kind==='self'?0:1);
  assert.ok(plan.items.some(x=>x.table==='registrations'));
  assert.equal(plan.items.filter(x=>x.table==='family-links').every(x=>x.item.accessStatus==='pending'),true);
  assert.equal(plan.items.filter(x=>x.table==='people').length,kind==='both'?2:kind==='child'?2:1);
 });
}
test('rejects wrong institution, no consent, mismatched mode, photos',()=>{
 const valid=input('child',[student('Child','child')]);
 for(const changes of [{institution:'raaga'},{consents:{registration:false}},{registrationType:'both'},{students:[{...student('Child','child'),photo:{name:'x'}}]}]){
  assert.throws(()=>validateSrutiSubmission({...valid,...changes}));
 }
});
test('rejects duplicate adult, arbitrary body and bad email',()=>{
 const base=input('self',[student('Test','self')]);
 assert.throws(()=>validateSrutiSubmission({...base,students:[student('Test','self'),student('Test','self')]}));
 assert.throws(()=>validateSrutiSubmission({...base,extra:'unexpected'}));
 assert.throws(()=>validateSrutiSubmission({...base,guardian:{...guardian,email:'bad'}}));
});

test('new public registration references are concise and distinguishable',()=>{
 const normalized=validateSrutiSubmission(input('child',[student('Child','child')]));
 const refs=new Set();
 for(let i=0;i<50;i++){
  const record=newSrutiIntakeRecord(normalized,'2026-11-04T12:00:00Z');
  assert.match(record.registrationId,/^SR-2026-[A-F0-9]{6}$/);
  assert.equal(record.institutionId,'sruti');
  refs.add(record.registrationId);
 }
 assert.ok(refs.size>1);
});
