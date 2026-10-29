import assert from 'node:assert/strict';
import {test} from 'node:test';
import {domainForPK,routeDocumentInput} from '../src/tableRouter.ts';
test('split table student, enrolment, teacher and homework routing',()=>{
 const prior=process.env.SADHANA_DATA_MODE;
 try{
  process.env.SADHANA_DATA_MODE='split';
  for(const [pk,suffix] of [
   ['OPS#GLOBAL#STUDENT','students'],['OPS#sruti#ENROLMENT','students'],
   ['TEACHER_REGISTRY','admin'],['ACCESS_REQUEST#sruti','admin'],
   ['OPS#sruti#HOMEWORK','learning'],['AUDIT#sruti','audit'],
   ['SCHEDULE#sruti','calendar']]){
   assert.equal(domainForPK(pk),suffix);
   assert.equal(routeDocumentInput({TableName:'sadhana-dev-main',Key:{PK:pk,SK:'TEST'}}).TableName,'sadhana-dev-'+suffix);
  }
  const tx=routeDocumentInput({TransactItems:[{Put:{TableName:'sadhana-dev-main',Item:{PK:'OPS#GLOBAL#STUDENT',SK:'ITEM#x'}}},{Put:{TableName:'sadhana-dev-main',Item:{PK:'AUDIT#raaga',SK:'x'}}}]});
  assert.deepEqual(tx.TransactItems.map(x=>x.Put.TableName),['sadhana-dev-students','sadhana-dev-audit']);
 }finally{if(prior===undefined)delete process.env.SADHANA_DATA_MODE;else process.env.SADHANA_DATA_MODE=prior;}
});
