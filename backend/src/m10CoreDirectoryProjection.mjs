/** M10 read-only compatibility projections. No migration writes or legacy table access. */
const validInstitution=x=>x==='raaga'||x==='sruti';
const hasScope=(item,inst)=>Array.isArray(item.institutionIds)&&item.institutionIds.includes(inst);
const requiredText=x=>typeof x==='string'&&x.length>0;
const cleanLegacy=(raw)=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!requiredText(raw.id))return null;
 const {PK,SK,GSI1PK,GSI1SK,GSI2PK,GSI2SK,entityType,...record}=raw;
 return record;
};
const name=x=>[x.firstName,x.middleName,x.lastName].filter(requiredText).join(' ').trim()||x.displayName||'';
export function projectM10Directory(entity,items,inst,people=[]){
 if(!validInstitution(inst))throw Error('M10_INVALID_INSTITUTION');
 if(!['students','families','enrolments'].includes(entity))throw Error('M10_INVALID_DIRECTORY_ENTITY');
 if(!Array.isArray(items))throw Error('M10_INVALID_DIRECTORY_ITEMS');
 const result=[];
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('M10_INVALID_RECORD');
  if(entity==='students'){
   if(!hasScope(item,inst)||!Array.isArray(item.personTypes)||!item.personTypes.includes('student'))continue;
   const legacy=cleanLegacy(item.legacyPayload);
   if(legacy){result.push({...legacy,rollNumber:item.studentProfile?.rollNumbers?.[inst]||legacy.rollNumber||''});continue;}
   if(!requiredText(item.personId)||!requiredText(item.familyId)||!requiredText(name(item)))throw Error('M10_INCOMPLETE_STUDENT');
   result.push({id:item.personId,name:name(item),phone:item.phone||'',familyId:item.familyId,
    createdIn:inst,visibleIn:item.institutionIds,archived:item.status==='archived',version:item.version??1,
    registrationType:'family',adultConfirmed:false,rollNumber:item.studentProfile?.rollNumbers?.[inst]||''});
  }else if(entity==='families'){
   if(!hasScope(item,inst))continue;
   const legacy=cleanLegacy(item.legacyPayload);
   if(legacy){result.push({...legacy,familyNumber:item.familyNumber||legacy.familyNumber||''});continue;}
   // Join the M9 primary contact. Never guess the guardian identity or use a foreign-institution person.
   const contact=people.find(p=>p.personId===item.primaryContactPersonId && hasScope(p,inst));
   if(!contact||!requiredText(name(contact))||!requiredText(contact.phone)||!requiredText(item.familyId))throw Error('M10_FAMILY_CONTACT_JOIN_REQUIRED');
   result.push({id:item.familyId,familyNumber:item.familyNumber||'',parentName:name(contact),phone:contact.phone,createdIn:inst,
    visibleIn:item.institutionIds,archived:item.status==='archived',version:item.version??1});
  }else{
   if(item.institutionId!==inst)continue;
   const legacy=cleanLegacy(item.legacyPayload);
   if(legacy){result.push(legacy);continue;}
   if(!requiredText(item.enrolmentId)||!requiredText(item.studentId)||!requiredText(item.classId)||!requiredText(item.startDate))throw Error('M10_INCOMPLETE_ENROLMENT');
   result.push({id:item.enrolmentId,institution:inst,studentId:item.studentId,classId:item.classId,startDate:item.startDate,
    endDate:item.endDate||'',archived:item.status==='archived',version:item.version??1});
  }
 }
 const ids=new Set();
 for(const record of result){if(ids.has(record.id))throw Error('M10_DUPLICATE_DIRECTORY_ID');ids.add(record.id);}
 return {records:result,more:false};
}
