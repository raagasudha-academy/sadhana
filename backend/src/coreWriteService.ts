import {entityTable} from './entityTables.mjs';
/** M10 guarded core-directory writes. M9 tables only. No Cognito grants, no PK/SK bridge. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,ScanCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,newId,validate} from './model.ts';
import {guardianLinkId} from './websiteImportCore.mjs';
import {academyRoll} from './academyRoll.mjs';
import type {InstitutionId,Claims} from './model.ts';

export type CoreEntity='families'|'students'|'enrolments';
type RecordValue=Record<string,any>;
export interface CoreDb {send(command:any):Promise<any>}
const table=(domain:string)=>entityTable(domain);
const scope=(r:RecordValue,inst:InstitutionId)=>Array.isArray(r?.institutionIds)&&r.institutionIds.includes(inst);
const text=(v:any)=>typeof v==='string'&&v.length>0;
const only=(x:RecordValue,keys:string[])=>{
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))throw httpError(400,'Unsupported or protected field.');
};
const names=(full:string)=>{const pieces=full.trim().split(/\s+/);return {firstName:pieces[0],lastName:pieces.slice(1).join(' '),displayName:full};};
const version=(v:unknown)=>Number.isSafeInteger(v)&&typeof v==='number'&&v>=1;
const idok=(v:string)=>typeof v==='string'&&/^[a-zA-Z0-9_#.:-]{1,180}$/.test(v);
const audit=(inst:InstitutionId,actor:string,action:string,resourceType:string,resourceId:string,now:string)=>({
 auditId:`aud_${randomUUID()}`,institutionId:inst,actorCognitoSub:actor,action,resourceType,resourceId,
 result:'success',timestamp:now,schemaVersion:1,
});
const put=(domain:string,item:RecordValue,key:string)=>({Put:{TableName:table(domain),Item:item,ConditionExpression:'attribute_not_exists(#id)',ExpressionAttributeNames:{'#id':key}}});
const check=(domain:string,key:RecordValue,condition:string,names:Record<string,string>,values:Record<string,any>)=>({ConditionCheck:{TableName:table(domain),Key:key,ConditionExpression:condition,ExpressionAttributeNames:names,ExpressionAttributeValues:values}});
const replace=(domain:string,key:RecordValue,item:RecordValue,condition:string,attrs:Record<string,string>,values:Record<string,any>)=>({Put:{TableName:table(domain),Item:item,ConditionExpression:condition,ExpressionAttributeNames:attrs,ExpressionAttributeValues:values}});
async function counter(db:CoreDb,inst:InstitutionId,name:'FAMILY_NUMBER'|'STUDENT_ROLL'){
 const previous=(await db.send(new GetCommand({TableName:table('counters'),Key:{counterId:`${inst}#${name}`},ConsistentRead:true}))).Item?.lastAllocated??0;
 if(!Number.isSafeInteger(previous)||previous<0)throw httpError(409,'Counter sequence requires review.');
 return {previous,write:{Update:{TableName:table('counters'),Key:{counterId:`${inst}#${name}`},
  UpdateExpression:'SET lastAllocated=:next, institutionId=:inst, sequenceType=:kind, updatedAt=:now',
  ConditionExpression:previous===0?'attribute_not_exists(counterId) OR lastAllocated=:previous':'lastAllocated=:previous',
  ExpressionAttributeValues:{':next':previous+1,':previous':previous,':inst':inst,':kind':name,':now':new Date().toISOString()}}}};
}
const validEmail=(v:any)=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=180;
const rollFrom=(p:RecordValue)=>{
 const profile=p?.studentProfile||{};
 const values=[profile.rollNumber,...Object.values(profile.rollNumbers||{})].filter(v=>typeof v==='string');
 const unique=[...new Set(values)];
 if(unique.length>1||unique.some(v=>!(/^(RS|SR)-\d{3,}$/.test(v))))throw httpError(409,'Existing student roll requires reconciliation.');
 return unique[0]||'';
};
const legacy=(item:RecordValue)=>{if(item?.legacyPayload?.id)return item.legacyPayload;return null;};
export function makeM10CoreWriteService(db:CoreDb){
 async function get(domain:string,key:string,id:string){return (await db.send(new GetCommand({TableName:table(domain),Key:{[key]:id},ConsistentRead:true}))).Item as RecordValue|undefined;}
 async function tx(actions:any[]){
  try{await db.send(new TransactWriteCommand({TransactItems:actions}));}
  catch(e:any){if(['TransactionCanceledException','ConditionalCheckFailedException'].includes(e?.name))throw httpError(409,'Record changed, duplicate, or relationship mismatch. Refresh and retry.');throw e;}
 }
 return {
  /** Explicitly add student role to an existing family primary contact. Never name/email-match. */
  async registerExistingGuardianAsStudent(inst:InstitutionId,claims:Claims,raw:RecordValue){
   if(!text(claims.sub))throw httpError(401,'Authenticated administrator required.');
   only(raw,['existingPersonId','existingPersonRole','familyId','relationship']);
   if(raw.relationship!=='parent_guardian'||!idok(raw.familyId)||
     !(idok(raw.existingPersonId)||raw.existingPersonRole==='primary_guardian'))
    throw httpError(400,'Select an existing parent/guardian and their family.');
   const family=await get('families','familyId',raw.familyId);
   const wanted=raw.existingPersonId||family?.primaryContactPersonId;
   const person=idok(wanted)?await get('people','personId',wanted):null;
   if(!person||!family||person.status!=='active'||family.status!=='active'||
      person.familyId!==family.familyId||family.primaryContactPersonId!==person.personId||
      !scope(person,inst)||!scope(family,inst)||!person.personTypes?.includes('guardian')||
      !version(person.version)||!version(family.version))throw httpError(409,'Verified same-family primary guardian required.');
   const currentRoll=rollFrom(person);
   if(person.personTypes.includes('student')) {
     if(!currentRoll)throw httpError(409,'Existing student roll requires reconciliation.');
     const currentInstitutionRoll=person.studentProfile?.rollNumbers?.[inst];
     if(currentInstitutionRoll===currentRoll)return {id:person.personId,name:person.displayName||[person.firstName,person.lastName].filter(Boolean).join(' '),
       rollNumber:currentRoll,familyId:family.familyId,relationship:'parent_guardian',alreadyRegistered:true};
     if(currentInstitutionRoll)throw httpError(409,'Conflicting student rolls require reconciliation.');
     const now=new Date().toISOString();
     const updated={...person,studentProfile:{...person.studentProfile,rollNumber:currentRoll,
       rollNumbers:{...(person.studentProfile?.rollNumbers||{}),[inst]:currentRoll}},
       version:person.version+1,updatedAt:now};
     await tx([replace('people',{personId:person.personId},updated,'#v=:v AND #f=:f',
       {'#v':'version','#f':'familyId'},{':v':person.version,':f':family.familyId}),
       check('families',{familyId:family.familyId},'#v=:v AND #c=:c',
       {'#v':'version','#c':'primaryContactPersonId'},{':v':family.version,':c':person.personId}),
       put('audit',audit(inst,claims.sub,'EXISTING_STUDENT_MEMBERSHIP_CONFIRMED','person',person.personId,now),'auditId')]);
     return {id:person.personId,name:person.displayName||[person.firstName,person.lastName].filter(Boolean).join(' '),rollNumber:currentRoll,
       familyId:family.familyId,relationship:'parent_guardian',alreadyRegistered:false};
   }
   if(currentRoll)throw httpError(409,'Unassigned roll requires reconciliation.');
   const seq=await counter(db,inst,'STUDENT_ROLL'),rollNumber=academyRoll(inst,seq.previous+1);
   const now=new Date().toISOString();
   const updated={...person,personTypes:[...person.personTypes,'student'],
     studentProfile:{...(person.studentProfile||{}),rollNumber,
       rollNumbers:{...(person.studentProfile?.rollNumbers||{}),[inst]:rollNumber}},
     version:person.version+1,updatedAt:now};
   await tx([
     seq.write,
     put('counters',{counterId:`ROLL_GLOBAL#${rollNumber}`,institutionId:inst,
       sequenceType:'ROLL_UNIQUE',personId:person.personId,createdAt:now},'counterId'),
     check('families',{familyId:family.familyId},'#v=:v AND #c=:c AND contains(#i,:inst)',
       {'#v':'version','#c':'primaryContactPersonId','#i':'institutionIds'},
       {':v':family.version,':c':person.personId,':inst':inst}),
     replace('people',{personId:person.personId},updated,
       '#v=:v AND #f=:f AND contains(#t,:guardian) AND contains(#i,:inst)',
       {'#v':'version','#f':'familyId','#t':'personTypes','#i':'institutionIds'},
       {':v':person.version,':f':family.familyId,':guardian':'guardian',':inst':inst}),
     put('audit',audit(inst,claims.sub,'EXISTING_GUARDIAN_STUDENT_ROLE_ADDED','person',person.personId,now),'auditId')
   ]);
   return {id:person.personId,name:person.displayName||[person.firstName,person.lastName].filter(Boolean).join(' '),rollNumber,familyId:family.familyId,
     relationship:'parent_guardian',alreadyRegistered:false};
  },
  async create(entity:CoreEntity,inst:InstitutionId,claims:Claims,raw:RecordValue){
   const actor=claims.sub;if(!text(actor))throw httpError(401,'Verified administrator required.');
   const body=validate(entity,raw),now=new Date().toISOString();
   if(entity==='families'){
    if(body.createdIn!==inst)throw httpError(403,'Institution mismatch.');
    const familyId=newId('FAMILY'),guardianId=newId('PERSON');
    const seq=await counter(db,inst,'FAMILY_NUMBER');
    const familyNumber=String(seq.previous+1).padStart(3,'0');
    const family={familyId,familyNumber,primaryContactPersonId:guardianId,institutionIds:[inst],status:'active',createdAt:now,updatedAt:now,version:1,
     legacyPayload:{...body,id:familyId,createdIn:inst,visibleIn:[inst],archived:false,version:1,createdAt:now,updatedAt:now}};
    const guardian={personId:guardianId,...names(body.parentName),phone:body.phone,personTypes:['guardian'],institutionIds:[inst],familyId,status:'active',createdAt:now,updatedAt:now,version:1};
    const phoneGuard={counterId:`FAMILY_PHONE#${inst}#${body.phone}`,institutionId:inst,sequenceType:'FAMILY_PHONE_GUARD',familyId,personId:guardianId,createdAt:now};
    await tx([seq.write,put('families',family,'familyId'),put('people',guardian,'personId'),put('counters',phoneGuard,'counterId'),put('audit',audit(inst,actor,'ACADEMY_FAMILY_CREATED','family',familyId,now),'auditId')]);
    return {...family.legacyPayload,familyNumber};
   }
   if(entity==='students'){
    if(body.createdIn!==inst)throw httpError(403,'Institution mismatch.');
    // Independent adults create an independent learner identity and family;
    // they never get attached to an existing guardian on the basis of names/contact.
    if(body.registrationType==='independent'){
      if(!validEmail(raw.email))throw httpError(400,'A verified-format email is required for adult student intake.');
      const email=raw.email.trim().toLowerCase(), phone=body.phone;
      let cursor:any=undefined;
      do {
        const result=await db.send(new ScanCommand({TableName:table('people'),ConsistentRead:true,
          ProjectionExpression:'personId,email,phone',...(cursor?{ExclusiveStartKey:cursor}:{})}));
        if((result.Items||[]).some((p:any)=>(p.email&&p.email.toLowerCase()===email)||(phone&&p.phone===phone)))
          throw httpError(409,'Existing person found. Select that person instead of creating a duplicate.');
        cursor=result.LastEvaluatedKey;
      } while(cursor);
      const familySeq=await counter(db,inst,'FAMILY_NUMBER');
      const rollSeq=await counter(db,inst,'STUDENT_ROLL');
      const familyId=newId('FAMILY'),personId=newId('PERSON');
      const rollNumber=academyRoll(inst,rollSeq.previous+1);
      const familyNumber=String(familySeq.previous+1).padStart(3,'0');
      const family={familyId,familyNumber,primaryContactPersonId:personId,institutionIds:[inst],
        status:'active',createdAt:now,updatedAt:now,version:1};
      const student={personId,...names(body.name),email,phone,familyId,
        personTypes:['guardian','student'],institutionIds:[inst],status:'active',createdAt:now,updatedAt:now,version:1,
        studentProfile:{rollNumber,rollNumbers:{[inst]:rollNumber}},
        legacyPayload:{...body,email,id:personId,relationship:'self',createdIn:inst,
          visibleIn:[inst],version:1,archived:false,createdAt:now,updatedAt:now}};
      await tx([familySeq.write,rollSeq.write,put('families',family,'familyId'),put('people',student,'personId'),
        put('counters',{counterId:`ROLL_GLOBAL#${rollNumber}`,institutionId:inst,
          sequenceType:'ROLL_UNIQUE',personId,createdAt:now},'counterId'),
        put('counters',{counterId:`STUDENT_EMAIL#${email}`,sequenceType:'STUDENT_EMAIL_GUARD',personId,createdAt:now},'counterId'),
        put('audit',audit(inst,actor,'INDEPENDENT_ADULT_STUDENT_CREATED','person',personId,now),'auditId')]);
      return {...student.legacyPayload,rollNumber,familyId};
    }
    if(body.registrationType!=='family')throw httpError(400,'Choose a valid registration type.');
    const family=await get('families','familyId',body.familyId);
    if(!family||!scope(family,inst)||family.status!=='active'||!idok(family.primaryContactPersonId))throw httpError(409,'Valid same-institution family required.');
    const guardian=await get('people','personId',family.primaryContactPersonId);
    if(!guardian||!scope(guardian,inst)||guardian.familyId!==family.familyId||!guardian.personTypes?.includes('guardian'))throw httpError(409,'Family primary contact requires verification.');
    const email=typeof raw.email==='string'?raw.email.trim().toLowerCase():'';
    if(email&&!validEmail(email))throw httpError(400,'Invalid student email.');
    const candidateName=body.name.trim().replace(/\s+/g,' ').toLowerCase();
    let cursor:any=undefined;
    do {
      const result=await db.send(new ScanCommand({TableName:table('people'),ConsistentRead:true,
        ProjectionExpression:'personId,familyId,email,displayName,firstName,lastName',
        ...(cursor?{ExclusiveStartKey:cursor}:{})}));
      if((result.Items||[]).some((p:any)=>
        (email&&typeof p.email==='string'&&p.email.toLowerCase()===email)||
        (p.familyId===family.familyId&&
         String(p.displayName||[p.firstName,p.lastName].filter(Boolean).join(' ')).trim().replace(/\s+/g,' ').toLowerCase()===candidateName)))
        throw httpError(409,'Person already exists. Select the existing person instead.');
      cursor=result.LastEvaluatedKey;
    } while(cursor);
    const seq=await counter(db,inst,'STUDENT_ROLL');
    const rollNumber=academyRoll(inst,seq.previous+1);
    const personId=newId('PERSON');const student={personId,...names(body.name),email,phone:body.phone||'',personTypes:['student'],institutionIds:[inst],familyId:family.familyId,status:'active',createdAt:now,updatedAt:now,version:1,
     studentProfile:{rollNumber,rollNumbers:{[inst]:rollNumber}},legacyPayload:{...body,email,id:personId,createdIn:inst,visibleIn:[inst],version:1,archived:false,createdAt:now,updatedAt:now}};
    const linkId=guardianLinkId(inst,guardian.personId,personId);
    const link={linkId,recordType:'guardian-access',institutionId:inst,familyId:family.familyId,personId:guardian.personId,guardianPersonId:guardian.personId,studentId:personId,relationship:'unverified',accessStatus:'pending',relationshipVerified:false,createdAt:now,updatedAt:now,version:1};
    await tx([
     seq.write,...(email?[put('counters',{counterId:`STUDENT_EMAIL#${email}`,sequenceType:'STUDENT_EMAIL_GUARD',personId,createdAt:now},'counterId')]:[]),put('counters',{counterId:`ROLL_GLOBAL#${rollNumber}`,institutionId:inst,sequenceType:'ROLL_UNIQUE',personId,createdAt:now},'counterId'),check('families',{familyId:family.familyId},'#v=:v AND #s=:s AND contains(#i,:inst)',{'#v':'version','#s':'status','#i':'institutionIds'},{':v':family.version,':s':'active',':inst':inst}),
     check('people',{personId:guardian.personId},'#v=:v AND #f=:f AND contains(#i,:inst)',{'#v':'version','#f':'familyId','#i':'institutionIds'},{':v':guardian.version,':f':family.familyId,':inst':inst}),
     put('people',student,'personId'),put('family-links',link,'linkId'),put('audit',audit(inst,actor,'ACADEMY_STUDENT_CREATED','person',personId,now),'auditId')]);
    return {...student.legacyPayload,rollNumber};
   }
   if(body.institution!==inst)throw httpError(403,'Institution mismatch.');
   const student=await get('people','personId',body.studentId);
   const cls=await get('classes','classId',body.classId);
   if(!student||!scope(student,inst)||!student.personTypes?.includes('student')||student.status!=='active'||!cls||cls.institutionId!==inst||cls.status==='archived')throw httpError(409,'Student and class must belong to this institution.');
   // Stronger than a scan-only overlap check: allow only one enrollment per student/class.
   // Existing records must be checked before the lock is created.
   const existing=await db.send(new QueryCommand({TableName:table('enrolments'),IndexName:'StudentEnrolmentsIndex',KeyConditionExpression:'#s=:s',ExpressionAttributeNames:{'#s':'studentId'},ExpressionAttributeValues:{':s':body.studentId}}));
   if(existing.LastEvaluatedKey)throw httpError(409,'Enrolment history requires administrator review.');
   if((existing.Items||[]).some((r:any)=>r.classId===body.classId&&r.status!=='archived'))throw httpError(409,'Student already enrolled in this class.');
   const enrolmentId=newId('ENROLMENT');const record={enrolmentId,institutionId:inst,studentId:body.studentId,classId:body.classId,startDate:body.startDate,endDate:body.endDate||'',status:'active',version:1,createdAt:now,updatedAt:now,
    legacyPayload:{...body,id:enrolmentId,version:1,archived:false,createdAt:now,updatedAt:now}};
   const lock={counterId:`ENROLMENT_PAIR#${inst}#${body.studentId}#${body.classId}`,institutionId:inst,sequenceType:'ENROLMENT_PAIR_GUARD',enrolmentId,createdAt:now};
   await tx([
    check('people',{personId:body.studentId},'#v=:v AND #s=:s AND contains(#i,:inst)',{'#v':'version','#s':'status','#i':'institutionIds'},{':v':student.version,':s':'active',':inst':inst}),
    check('classes',{classId:body.classId},'#v=:v AND #i=:inst',{'#v':'version','#i':'institutionId'},{':v':cls.version,':inst':inst}),
    put('counters',lock,'counterId'),put('enrolments',record,'enrolmentId'),put('audit',audit(inst,actor,'ACADEMY_ENROLMENT_CREATED','enrolment',enrolmentId,now),'auditId')]);
   return record.legacyPayload;
  },
  async endEnrolment(inst:InstitutionId,claims:Claims,id:string,raw:RecordValue){
   if(!idok(id))throw httpError(400,'Invalid enrolment ID.');
   if(!text(claims.sub))throw httpError(401,'Verified administrator required.');
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw httpError(400,'Invalid removal confirmation.');
   only(raw,['confirm','expectedVersion']);
   if(raw.confirm!=='DELETE'||!version(raw.expectedVersion))throw httpError(400,'Confirm DELETE with the current enrolment version.');
   const current=await get('enrolments','enrolmentId',id);
   if(!current)throw httpError(404,'Enrolment not found.');
   if(current.institutionId!==inst)throw httpError(403,'Institution mismatch.');
   if(current.status==='archived')throw httpError(409,'Enrolment already ended. Refresh the list.');
   if(current.version!==raw.expectedVersion)throw httpError(409,'Enrolment changed. Refresh and retry.');
   if(!idok(current.studentId)||!idok(current.classId))throw httpError(409,'Invalid enrolment relationship.');
   const now=new Date().toISOString();
   const prior=legacy(current);
   const next={...current,status:'archived',version:current.version+1,updatedAt:now,
    ...(prior?{legacyPayload:{...prior,archived:true,version:current.version+1,updatedAt:now}}:{})};
   const lockId=`ENROLMENT_PAIR#${inst}#${current.studentId}#${current.classId}`;
   const lock=await get('counters','counterId',lockId);
   if(lock&&lock.enrolmentId!==id)throw httpError(409,'Enrolment pair is reserved by another record.');
   const actions:any[]=[
    replace('enrolments',{enrolmentId:id},next,'#v=:v AND #i=:inst AND #s=:active',
      {'#v':'version','#i':'institutionId','#s':'status'},
      {':v':current.version,':inst':inst,':active':'active'}),
    put('audit',audit(inst,claims.sub!,'ACADEMY_ENROLMENT_ENDED','enrolment',id,now),'auditId')
   ];
   // The paired lock is deleted only when it belongs to this exact enrolment.
   // Older imported enrolments can legitimately lack a lock.
   if(lock)actions.push({Delete:{TableName:table('counters'),Key:{counterId:lockId},
     ConditionExpression:'#e=:id',ExpressionAttributeNames:{'#e':'enrolmentId'},ExpressionAttributeValues:{':id':id}}});
   await tx(actions);
   return {deleted:true,enrolmentId:id};
  },
  async update(entity:CoreEntity,inst:InstitutionId,claims:Claims,id:string,raw:RecordValue){
   if(!idok(id))throw httpError(400,'Invalid ID.');
   if(!text(claims.sub))throw httpError(401,'Verified administrator required.');
   if(!raw||!version(raw.expectedVersion))throw httpError(400,'Expected version required.');
   const {expectedVersion,...changes}=raw;
   // Contact changes, relationship changes and identity reassignment need dedicated review.
   const allowed:Record<CoreEntity,string[]>={families:['parentName'],students:['name'],enrolments:['studentId','classId','startDate','endDate']};
   only(changes,allowed[entity]);if(!Object.keys(changes).length)throw httpError(400,'No changes provided.');
   const domain=entity==='students'?'people':entity;const key=entity==='students'?'personId':entity==='families'?'familyId':'enrolmentId';
   const current=await get(domain,key,id);
   if(!current)throw httpError(404,'Record not found. Refresh the list.');
   if(current.status==='archived')throw httpError(409,entity==='enrolments'?'This enrolment has already ended. Refresh the list.':'This record is archived. Refresh the list.');
   if(current.version!==expectedVersion)throw httpError(409,entity==='enrolments'?'This enrolment changed after it was loaded. Refresh and retry.':'This record changed after it was loaded. Refresh and retry.');
   if(entity==='enrolments'?current.institutionId!==inst:!scope(current,inst))throw httpError(403,'Institution mismatch.');
   if(entity!=='enrolments'&&current.institutionIds.length!==1)throw httpError(409,'Shared identities require dedicated reconciliation.');
   const old=legacy(current)??(entity==='enrolments'?{
    id:current.enrolmentId,institution:inst,studentId:current.studentId,classId:current.classId,
    startDate:current.startDate,endDate:current.endDate||'',
   }:null);
   if(!old)throw httpError(409,'This record requires a canonical data edit workflow.');
   const base=Object.fromEntries(Object.entries(old).filter(([k])=>!['id','version','createdAt','updatedAt','archived','visibleIn'].includes(k)));
   const updated=validate(entity,{...base,...(entity==='enrolments'?{
    institution:inst,studentId:current.studentId,classId:current.classId,
    startDate:current.startDate,endDate:current.endDate||'',
   }:{}),...changes});
   if(entity==='families'&&current.primaryContactPersonId){
    const contact=await get('people','personId',current.primaryContactPersonId);
    if(!contact||contact.familyId!==id||!scope(contact,inst))throw httpError(409,'Primary contact mismatch.');
    const now=new Date().toISOString();const newContact={...contact,...names(updated.parentName),version:contact.version+1,updatedAt:now};
    const newFamily={...current,version:expectedVersion+1,updatedAt:now,legacyPayload:{...old,...updated,version:expectedVersion+1,updatedAt:now}};
    await tx([
     replace('families',{familyId:id},newFamily,'#v=:v AND contains(#i,:inst)',{'#v':'version','#i':'institutionIds'},{':v':expectedVersion,':inst':inst}),
     replace('people',{personId:contact.personId},newContact,'#v=:v AND #f=:f',{'#v':'version','#f':'familyId'},{':v':contact.version,':f':id}),
     put('audit',audit(inst,claims.sub!,'ACADEMY_FAMILY_UPDATED','family',id,now),'auditId')]);
    return newFamily.legacyPayload;
   }
   if(entity==='enrolments'&&(updated.studentId!==current.studentId||updated.classId!==current.classId))throw httpError(409,'Enrolment identity immutable.');
   const now=new Date().toISOString();const next:RecordValue={...current,version:expectedVersion+1,updatedAt:now,legacyPayload:{...old,...updated,version:expectedVersion+1,updatedAt:now}};
   if(entity==='students')Object.assign(next,names(updated.name));
   if(entity==='enrolments'){next.startDate=updated.startDate;next.endDate=updated.endDate||'';}
   await tx([
    replace(domain,{[key]:id},next,entity==='enrolments'?'#v=:v AND #i=:inst':'#v=:v AND contains(#i,:inst)',{'#v':'version','#i':entity==='enrolments'?'institutionId':'institutionIds'},{':v':expectedVersion,':inst':inst}),
    put('audit',audit(inst,claims.sub!,`ACADEMY_${entity.toUpperCase()}_UPDATED`,entity,id,now),'auditId')]);
   return next.legacyPayload;
  }
 };
}
let singleton:ReturnType<typeof makeM10CoreWriteService>|undefined;
export function m10CoreWriteService(){
 if(!singleton){const db=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});singleton=makeM10CoreWriteService(db);}
 return singleton;
}
