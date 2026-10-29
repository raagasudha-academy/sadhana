import {makeRoutedClient,expectedTables} from './tableRouter.ts';
import {DEPENDENT_WRITER_KINDS,dependentStudentGuard} from './revocationWriterFence.ts';
/** Sadhana v0.9: institution-scoped operational records, no schema/index migration. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,PutCommand,UpdateCommand,TransactWriteCommand,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {clean,demandInstitution,demandViewInstitution,httpError,permittedInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('SADHANA_TABLE_NAME missing');return process.env.SADHANA_TABLE_NAME;};
const dateOK=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const institution=(s:string):InstitutionId=>{if(s!=='sruti'&&s!=='raaga')throw httpError(400,'Select an academy.');return s;};
const allowedFields={family:['parentName','email','phone','location','archived'],student:['name','email','phone','location','familyId','adultConfirmed','relationship','archived'],enrolment:['studentId','classId','startDate','endDate','archived'],attendance:['studentId','sessionId','status','note'],practice:['studentId','classId','date','didPractice','minutes','comments'],feedback:['studentId','classId','date','note'],rsvp:['studentId','sessionId','intention','note']} as const;
type Kind=keyof typeof allowedFields;
const kinds=Object.keys(allowedFields) as Kind[];
// Global family/student identity shared by both academies; operational records remain academy-scoped.
const key=(inst:InstitutionId,kind:Kind,id:string)=>({PK:kind==='family'||kind==='student'?`OPS#GLOBAL#${kind.toUpperCase()}`:`OPS#${inst}#${kind.toUpperCase()}`,SK:`ITEM#${id}`});
// Atomic DynamoDB ADD prevents duplicate roll numbers under concurrent registration.
// A failed downstream write can leave a gap; numbers are intentionally never reused.
async function allocate(inst:InstitutionId,kind:'family'|'student') {
 const result=await db.send(new UpdateCommand({TableName:table(),Key:{PK:inst==='raaga'?'OPS#raaga#COUNTERS':'OPS#GLOBAL#COUNTERS',SK:kind.toUpperCase()},UpdateExpression:'ADD #n :one',ExpressionAttributeNames:{'#n':'value'},ExpressionAttributeValues:{':one':1},ReturnValues:'UPDATED_NEW'}));
 const value=result.Attributes?.value;
 if(!Number.isSafeInteger(value)||value<1)throw Error('Number allocation failed');
 return String(value).padStart(3,'0');
}

const get=async(inst:InstitutionId,kind:Kind,id:string)=> (await db.send(new GetCommand({TableName:table(),Key:key(inst,kind,id),ConsistentRead:true}))).Item;
const rows=async(inst:InstitutionId,kind:Kind)=>{const records:any[]=[];let cursor:any;do{const r=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':key(inst,kind,'').PK},ConsistentRead:true,ExclusiveStartKey:cursor,Limit:100}));records.push(...(r.Items||[]));cursor=r.LastEvaluatedKey;if(records.length>1000)throw httpError(413,'Directory too large; pagination required.');}while(cursor);return records.map(({PK,SK,...data})=>data);};
const master=async(inst:InstitutionId,id:string)=>{const record=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConsistentRead:true}))).Item;if(!record||record.recordType!=='class')throw httpError(404,'Master class not found.');return record;};
const session=async(inst:InstitutionId,id:string)=>{const record=(await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConsistentRead:true}))).Item;if(!record||!['class-session','special-event'].includes(record.recordType))throw httpError(404,'Dated session not found.');return record;};
const teacher=async(inst:InstitutionId,claims:Claims,classId:string)=>{
 if(permittedInstitutions(claims).includes(inst))return true;
 demandViewInstitution(claims,inst);
 const m=await master(inst,classId);
 if(m.lifecycleStatus==='archived')throw httpError(409,'Archived classes cannot receive new teacher entries.');
 if(!m.teacherId)throw httpError(403,'Class must have a linked registered teacher before staff can update student records.');
 const link=(await db.send(new GetCommand({TableName:table(),Key:{PK:`TEACHER_SUB#${claims.sub}`,SK:'LINK'},ConsistentRead:true}))).Item;
 const registry=(await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${m.teacherId}`},ConsistentRead:true}))).Item;
 if(!registry?.active||registry.cognitoSub!==claims.sub||!registry.institutions?.includes(inst)||link?.teacherId&&link.teacherId!==m.teacherId)throw httpError(403,'Only the assigned registered teacher can manage this class.');
 return true;
};
const enrolled=async(inst:InstitutionId,studentId:string,classId:string,day?:string)=>{const list=await rows(inst,'enrolment');if(!list.some(e=>!e.archived&&e.studentId===studentId&&e.classId===classId&&(!day||e.startDate<=day&&(!e.endDate||day<=e.endDate))))throw httpError(403,'Student is not enrolled in this class on the chosen date.');};
const validate=(kind:Kind,d:any)=>{
 if(!d||typeof d!=='object'||Array.isArray(d))throw httpError(400,'Invalid record.');
 const extra=Object.keys(d).filter(k=>!allowedFields[kind].includes(k as never));if(extra.length)throw httpError(400,`Unsupported fields: ${extra.join(', ')}`);
 if(d.archived!==undefined&&typeof d.archived!=='boolean')throw httpError(400,'Invalid archived flag.');
 const str=(k:string,n=180)=>{if(d[k]!==undefined){if(typeof d[k]!=='string')throw httpError(400,`Invalid ${k}.`);d[k]=clean(d[k]).slice(0,n);}};
 for(const k of ['name','parentName','email','phone','location','familyId','studentId','classId','sessionId','status','intention','note','comments','startDate','endDate','date','relationship'])str(k,k==='note'||k==='comments'?1500:180);
 if(kind==='family'&&(!d.parentName||!/^\+[1-9]\d{7,14}$/.test(d.phone||'')))throw httpError(400,'Parent/guardian name and international phone required.');
 if(d.email!==undefined){d.email=d.email.trim().toLowerCase();if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email))throw httpError(400,'Enter a valid email address.');}
 if(kind==='family'&&!d.email)throw httpError(400,'Parent/guardian email required.');
 if(kind==='student'&&(!d.familyId||d.relationship==='parent_guardian')&&!d.email)throw httpError(400,'Adult student email required.');
 if(kind==='student'&&(!d.familyId||d.relationship==='parent_guardian')&&!/^\+[1-9]\d{7,14}$/.test(d.phone||''))throw httpError(400,'Adult student international phone required.');
 if(kind==='student'&&(!d.name||(d.phone&&!/^\+[1-9]\d{7,14}$/.test(d.phone))))throw httpError(400,'Valid student name and phone required.');
 if(kind==='student'&&!d.familyId&&d.adultConfirmed!==true)throw httpError(400,'Independent students must confirm adulthood.');
 if(kind==='enrolment'&&(!d.studentId||!d.classId||!dateOK(d.startDate)||d.endDate&&!dateOK(d.endDate)||d.endDate&&d.endDate<d.startDate))throw httpError(400,'Student, master class and valid dates required.');
 if(kind==='attendance'&&(!d.studentId||!d.sessionId||!['present','absent','late','excused'].includes(d.status)))throw httpError(400,'Choose student, session and attendance status.');
 if(kind==='rsvp'&&(!d.studentId||!d.sessionId||!['attending','not_attending','unknown'].includes(d.intention)))throw httpError(400,'Choose student, session and RSVP intention.');
 if(kind==='practice'&&(!d.studentId||!d.classId||!dateOK(d.date)||typeof d.didPractice!=='boolean'||!Number.isInteger(d.minutes)||d.minutes<0||d.minutes>1440||d.didPractice&&d.minutes<1))throw httpError(400,'Valid practice date, student, class and minutes required.');
 if(kind==='feedback'&&(!d.studentId||!d.classId||!dateOK(d.date)||!d.note))throw httpError(400,'Student, class, date and feedback required.');
};
export async function operations(instRaw:string,kindRaw:string,method:string,claims:Claims,body:any={},id=''){
 const inst=institution(instRaw);const kind=kindRaw as Kind;if(!kinds.includes(kind))throw httpError(404,'Unknown operational resource.');
 const admin=permittedInstitutions(claims).includes(inst);
 // Deny requests without academy access before any directory read.
 demandViewInstitution(claims,inst);
 if(method==='GET'){
  if(!admin){if(!['student','enrolment','attendance','practice','feedback','rsvp'].includes(kind))throw httpError(403,'Family contact details require administrator access.');// Return only records belonging to a verified teaching assignment.
   const safe:any[]=[];const teacherEnrolments=kind==='student'?await rows(inst,'enrolment'):[];for(const r of await rows(inst,kind)){if(kind==='student'){const allowedClasses=teacherEnrolments.filter(e=>e.studentId===r.id&&!e.archived);let assigned=false;for(const e of allowedClasses){try{await teacher(inst,claims,e.classId);assigned=true;break;}catch{/* another teacher */}}if(assigned)safe.push({id:r.id,name:r.name,rollNumber:r.rollNumber||'',institution:inst});continue;}const linkedSession=(kind==='attendance'||kind==='rsvp')?await session(inst,r.sessionId):null;const classId=kind==='enrolment'?r.classId:r.classId||linkedSession?.classId;if(!classId&&linkedSession?.eventKind!=='class')continue;try{if(linkedSession?.eventKind==='class'){const reg=(await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${linkedSession.teacherId}`}}))).Item;if(!reg?.active||reg.cognitoSub!==claims.sub)continue;}else await teacher(inst,claims,classId);safe.push(kind==='enrolment'?{id:r.id,studentId:r.studentId,classId:r.classId,startDate:r.startDate,endDate:r.endDate,archived:r.archived}:r);}catch{/* not this teacher */}}return {records:safe};}
  return {records:await rows(inst,kind)};
 }
 // Explicit permanent family deletion: fail closed if any outside record refers to the family or its students.
 // Scan uses physical table clients since the split-table router intentionally has no Scan support.
 if(method==='DELETE'){
  if(kind==='enrolment'){
   if(!admin)throw httpError(403,'Only academy administrators can remove enrolments.');
   if(!id)throw httpError(400,'Enrolment ID is required.');
   const enrolment=await get(inst,'enrolment',id);
   if(!enrolment||enrolment.institution!==inst)throw httpError(404,'Enrolment not found in this academy.');
   if(body?.confirm!=='DELETE'||body?.expectedVersion!==enrolment.version)throw httpError(400,'Confirm DELETE with the current enrolment version.');
   // Do not remove an enrolment if any learning, attendance, RSVP or feedback depends on the student/class.
   // This is deliberately conservative: review ambiguous history rather than orphaning records.
   const linkedKinds=['attendance','practice','feedback','rsvp'] as const;
   for(const linkedKind of linkedKinds){
    const all=await rows(inst,linkedKind);
    if(all.some((r:any)=>r.studentId===enrolment.studentId &&
      (r.classId===enrolment.classId || !!r.sessionId)))
     throw httpError(409,'Student has learning, attendance or RSVP history. End the enrolment instead of permanently deleting it.');
   }
   const allOther=await rows(inst,'enrolment');
   if(allOther.some((r:any)=>r.id!==id&&r.studentId===enrolment.studentId&&r.classId===enrolment.classId))
    throw httpError(409,'Multiple enrolment records exist for this student and class; review before deletion.');
   try{await db.send(new TransactWriteCommand({TransactItems:[{Delete:{TableName:table(),Key:key(inst,'enrolment',id),ConditionExpression:'#v=:v AND institution=:i AND studentId=:s AND classId=:c',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':enrolment.version,':i':inst,':s':enrolment.studentId,':c':enrolment.classId}}}]}));}
   catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Enrolment changed. Refresh and retry.');throw e;}
   return {deleted:true,enrolmentId:id};
  }
  if(kind!=='family'||!id)throw httpError(405,'Only family permanent deletion is supported.');
  if(!admin)throw httpError(403,'Only academy administrators can delete families.');
  const family=await get(inst,'family',id);
  if(!family||family.institution!==inst)throw httpError(404,'Family not found in this academy.');
  if(body?.confirm!=='DELETE'||body?.expectedVersion!==family.version)throw httpError(400,'Confirm DELETE and the current family version.');
  const children=(await rows(inst,'student')).filter(s=>s.familyId===id);
  if(children.some(s=>s.institution!==inst))throw httpError(409,'Family has cross-academy student records; manual review needed.');
  if(children.length>20)throw httpError(409,'This family exceeds the 20-student safe-delete limit.');
  const studentIds=new Set(children.map(s=>s.id));
  const watchIds=new Set([id,...studentIds]);
  const direct=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
  const physicalTables=process.env.SADHANA_DATA_MODE==='split'?Object.values(expectedTables):[table()];
  let inspected=0;
  for(const tableName of physicalTables){
   let cursor:any;
   do{
    const page=await direct.send(new ScanCommand({TableName:tableName,ExclusiveStartKey:cursor,Limit:200,ConsistentRead:true}));
    for(const r of page.Items||[]){
     inspected++;
     if(inspected>10000)throw httpError(409,'Too many records to prove family deletion safe; manual review required.');
     // Deletion targets are the family and students themselves, not dependencies.
     if((r.PK==='OPS#GLOBAL#FAMILY'&&r.SK===`ITEM#${id}`)||
       (r.PK==='OPS#GLOBAL#STUDENT'&&studentIds.has(r.id)&&r.SK===`ITEM#${r.id}`))continue;
     // Audit records are historical events, not live references that can grant access.
     if(String(r.PK||'').startsWith('AUDIT#'))continue;
     // Check nested objects too; access and future relationship schemas can differ.
     const serialized=JSON.stringify(r);
     if([...watchIds].some(ref=>serialized.includes(ref)))
       throw httpError(409,`Family has linked enrolment, learning, access or other records in ${tableName}; remove dependencies before deleting.`);
    }
    cursor=page.LastEvaluatedKey;
   }while(cursor);
  }
  const deletes=[...children.map(s=>({Delete:{TableName:table(),Key:key(inst,'student',s.id),ConditionExpression:'#v=:v AND institution=:i AND familyId=:f',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':s.version,':i':inst,':f':id}}})),
   {Delete:{TableName:table(),Key:key(inst,'family',id),ConditionExpression:'#v=:v AND institution=:i',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':family.version,':i':inst}}}];
  try{await db.send(new TransactWriteCommand({TransactItems:deletes}));}
  catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Family changed during deletion; refresh and retry.');throw e;}
  return {deleted:true,familyId:id,studentsDeleted:children.length};
 }
 if(method!=='POST'&&method!=='PATCH')throw httpError(405,'Unsupported action.');
 if(!admin)demandViewInstitution(claims,inst);
 if(!admin&&['family','student','enrolment'].includes(kind))throw httpError(403,'Administrators manage identities and enrolments.');
 if(method==='PATCH'&&!id)throw httpError(400,'Record ID required.');
  // A family and its learners are one unit: all records are committed together.
  // Allocate IDs before the transaction; failed attempts can leave permanent number gaps.
  if(method==='POST'&&kind==='family'&&Array.isArray(body?.members)){
    if(!admin)throw httpError(403,'Only administrators can register families.');
    if(body.members.length<1||body.members.length>20)throw httpError(400,'Choose 1–20 learners per family.');
    const {members,...familyDraft}=body;
    validate('family',familyDraft);
    const parsed=members.map((input:any)=>{
      if(!input||typeof input!=='object'||Array.isArray(input))throw httpError(400,'Invalid family member.');
      const draft={name:input.name,email:input.email||'',phone:input.phone||'',familyId:'PENDING',relationship:input.relationship||'child'};
      validate('student',draft);
      if(!draft.name)throw httpError(400,'Every learner needs a name.');
      return draft;
    });
    if(new Set(parsed.map((r:any)=>r.name.toLowerCase())).size!==parsed.length)throw httpError(400,'Duplicate learner names in family.');
    const familyNumber=await allocate(inst,'family');
    const studentNumbers:string[]=[];
    for(const _ of parsed)studentNumbers.push(await allocate(inst,'student'));
    const familyId=`FAMILY-${randomUUID()}`;
    const now=new Date().toISOString();
    const fam={...key(inst,'family',familyId),...familyDraft,familyNumber,id:familyId,institution:inst,version:1,createdAt:now,updatedAt:now,updatedBy:claims.sub};
    const students=parsed.map((draft:any,i:number)=>{
      const id=`STUDENT-${randomUUID()}`;
      return {...key(inst,'student',id),...draft,familyId,studentNumber:studentNumbers[i],rollNumber:`${familyNumber}-${studentNumbers[i]}`,id,institution:inst,version:1,createdAt:now,updatedAt:now,updatedBy:claims.sub};
    });
    const audit={PK:`AUDIT#${inst}`,SK:`AT#${now}#${randomUUID()}`,entityType:'AUDIT',type:'REGISTER_FAMILY_MEMBERS',resource:'ops-family',id:familyId,studentIds:students.map((r:any)=>r.id),actorSub:claims.sub,at:now};
    try{await db.send(new TransactWriteCommand({TransactItems:[fam,...students,audit].map(Item=>({Put:{TableName:table(),Item,ConditionExpression:'attribute_not_exists(PK)'}}))}));}
    catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Registration conflict. Refresh and retry; allocated numbers will not be reused.');throw e;}
    const {PK,SK,...record}=fam;
    return {record,students:students.map(({PK,SK,...r}:any)=>r)};
  }
  // Convert an existing independent adult into a family guardian atomically.
  // The original student ID and roll number are immutable, including its 000 prefix.
  if(method==='POST'&&kind==='family'&&body?.existingStudentId){
    if(!admin)throw httpError(403,'Only administrators can create families.');
    const studentId=body.existingStudentId;
    if(typeof studentId!=='string'||!studentId.startsWith('STUDENT-'))throw httpError(400,'Invalid existing student ID.');
    const student=await get(inst,'student',studentId);
    if(!student)throw httpError(404,'Student not found.');
    if(student.familyId)throw httpError(409,'Student already belongs to a family.');
    if(student.adultConfirmed!==true)throw httpError(409,'Only a confirmed independent adult can convert to family.');
    const {existingStudentId,...familyDraft}=body;
    validate('family',familyDraft);
    const number=await allocate(inst,'family');
    const now=new Date().toISOString();
    const familyId=`FAMILY-${randomUUID()}`;
    const familyItem={...key(inst,'family',familyId),...familyDraft,familyNumber:number,id:familyId,institution:inst,version:1,createdAt:now,updatedAt:now,updatedBy:claims.sub};
    const studentItem={...student,familyId,version:student.version+1,updatedAt:now,updatedBy:claims.sub};
    const audit={PK:`AUDIT#${inst}`,SK:`AT#${now}#${randomUUID()}`,entityType:'AUDIT',type:'CONVERT_INDIVIDUAL_TO_FAMILY',resource:'ops-family',id:familyId,studentId,actorSub:claims.sub,at:now};
    try{await db.send(new TransactWriteCommand({TransactItems:[
      {Put:{TableName:table(),Item:familyItem,ConditionExpression:'attribute_not_exists(PK)'}},
      {Put:{TableName:table(),Item:studentItem,ConditionExpression:'#v=:v AND (attribute_not_exists(familyId) OR familyId=:empty)',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':student.version,':empty':''}}},
      {Put:{TableName:table(),Item:audit}}
    ]}));}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Student changed during conversion. Refresh and retry.');throw e;}
    const {PK,SK,...record}=familyItem;return {record};
  }
 const old=id?await get(inst,kind,id):null;if(id&&!old)throw httpError(404,'Record not found.');
 if(old&&body.expectedVersion!==old.version)throw httpError(409,'Record changed; refresh before saving.');
 // A teacher may edit only a record that was already theirs, even if a PATCH
 // attempts to replace its class or linked student with one they can access.
 if(old&&!admin&&['attendance','practice','feedback','rsvp'].includes(kind)){
  const priorSession=(kind==='attendance'||kind==='rsvp')?await session(inst,old.sessionId):null;
  const priorClass=(kind==='attendance'||kind==='rsvp')?(priorSession.classId||priorSession.id):old.classId;
  if(priorSession?.eventKind==='class'&&priorSession.recordType==='special-event'){
   const assigned=(await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${priorSession.teacherId}`},ConsistentRead:true}))).Item;
   if(!assigned?.active||assigned.cognitoSub!==claims.sub)throw httpError(403,'This record belongs to another teacher.');
  }else await teacher(inst,claims,priorClass);
 }
 // Archive/restore is administrator-only and preserves IDs, roll numbers and all history.
 if((kind==='family'||kind==='student')&&body.archived!==undefined){
  if(!admin)throw httpError(403,'Only administrators can archive identities.');
  if(method!=='PATCH'||!old)throw httpError(400,'Archive/restore requires an existing record.');
  if(typeof body.archived!=='boolean')throw httpError(400,'archived must be boolean.');
  if(kind==='family'&&body.archived){const children=await rows(inst,'student');
   if(children.some(r=>r.familyId===id&&!r.archived))throw httpError(409,'Archive or reassign every student before archiving this family.');
  }
  if(kind==='student'&&body.archived){for(const scope of ['raaga','sruti'] as InstitutionId[]){
   const linked=await rows(scope,'enrolment');
   if(linked.some(r=>r.studentId===id&&!r.archived))throw httpError(409,'Student has enrolments. Archive or end these enrolments before archiving the student.');
  }}
 }
 const {expectedVersion,...changes}=body;const draft={...(old?Object.fromEntries(Object.entries(old).filter(([k])=>allowedFields[kind].includes(k as never))):{}),...changes};
 validate(kind,draft);
 if(old&&kind==='enrolment'&&(draft.studentId!==old.studentId||draft.classId!==old.classId))throw httpError(400,'To change the student or master class, create a separate enrolment.');
 if(old&&(kind==='attendance'||kind==='rsvp')&&(draft.studentId!==old.studentId||draft.sessionId!==old.sessionId))throw httpError(400,'Attendance identity cannot change; create a new record.');
 if(old&&kind==='practice'&&(draft.studentId!==old.studentId||draft.classId!==old.classId||draft.date!==old.date))throw httpError(400,'Practice identity/date cannot change.');
 if(kind==='student'&&draft.familyId&&!await get(inst,'family',draft.familyId))throw httpError(404,'Family not found.');
 if(kind==='enrolment'){
  const applicant=await get(inst,'student',draft.studentId);if(!applicant)throw httpError(404,'Student not found.');if(applicant.archived)throw httpError(409,'Restore student before enrolling.');const chosenMaster=await master(inst,draft.classId);if(chosenMaster.lifecycleStatus==='archived'&&!draft.archived)throw httpError(409,'Cannot enrol into an archived master class.');
  const existing=await rows(inst,'enrolment');if(existing.some(e=>e.id!==id&&!e.archived&&!draft.archived&&e.studentId===draft.studentId&&e.classId===draft.classId&&(!e.endDate||e.endDate>=draft.startDate)&&(!draft.endDate||draft.endDate>=e.startDate)))throw httpError(409,'Overlapping enrolment already exists.');
 }
 if(['attendance','practice','feedback','rsvp'].includes(kind)){
  const s=(kind==='attendance'||kind==='rsvp')?await session(inst,draft.sessionId):null;
  const compensation=(kind==='attendance'||kind==='rsvp')&&s.recordType==='special-event'&&s.eventKind==='class';
  const classId=(kind==='attendance'||kind==='rsvp')?(s.classId||s.id):draft.classId;
  if(compensation){if(!admin){const reg=(await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${s.teacherId}`},ConsistentRead:true}))).Item;if(!reg?.active||reg.cognitoSub!==claims.sub||!reg.institutions?.includes(inst))throw httpError(403,'Only the assigned teacher can record compensation attendance.');}}
  else await teacher(inst,claims,classId);
  const date=(kind==='attendance'||kind==='rsvp')?s.date:draft.date;
  if(!date||!dateOK(date))throw httpError(400,'A dated session is required.');
  if(compensation){const enr=await rows(inst,'enrolment');if(!enr.some(e=>e.studentId===draft.studentId&&!e.archived&&e.startDate<=date&&(!e.endDate||e.endDate>=date)))throw httpError(403,'Student must have an active academy enrolment to attend a compensation class.');}
  else await enrolled(inst,draft.studentId,classId,date);
  if((kind==='attendance'||kind==='rsvp')&&s.recordType!=='class-session'&&!compensation)throw httpError(400,'Select a dated class session or compensation class.');
  const prior=await rows(inst,kind);
  if((kind==='attendance'||kind==='rsvp')&&prior.some(r=>r.id!==id&&r.studentId===draft.studentId&&r.sessionId===draft.sessionId))throw httpError(409,'A record for this student and session already exists; edit the existing entry.');
  if(kind==='practice'&&prior.some(r=>r.id!==id&&r.studentId===draft.studentId&&r.classId===draft.classId&&r.date===draft.date))throw httpError(409,'Practice already recorded for this student, class and date.');
 }
 const now=new Date().toISOString();const nextId=id||`${kind.toUpperCase()}-${randomUUID()}`;
 let familyNumber: string|undefined=old?.familyNumber;
 let rollNumber: string|undefined=old?.rollNumber;
 let studentNumber: string|undefined=old?.studentNumber;
 if(!old&&kind==='family')familyNumber=await allocate(inst,'family');
 if(!old&&kind==='student'){
  studentNumber=await allocate(inst,'student');
  const f=draft.familyId?await get(inst,'family',draft.familyId):null;
  if(f&&!f.familyNumber)throw httpError(409,'Family has no allocated number. Reset test registration records before using new numbering.');
  rollNumber=`${f?.familyNumber||'000'}-${studentNumber}`;
 }

 // Serialize enrolment creation/updates against master deletion. A concurrent master
 // deletion and enrolment transaction cannot both commit successfully.
 const masterGuard=kind==='enrolment'?{ConditionCheck:{TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(draft.classId)},ConditionExpression:'#type=:type AND #version=:version',ExpressionAttributeNames:{'#type':'recordType','#version':'version'},ExpressionAttributeValues:{':type':'class',':version':(await master(inst,draft.classId)).version}}}:null;
 // Every dependent-record save must be serialized against changes to the global student identity.
 // A revocation coordinator must first fence the identity with a versioned write, then
 // scan dependencies. Do not enable revocation until that coordinator is implemented.
 const dependencyGuard=DEPENDENT_WRITER_KINDS.includes(kind as typeof DEPENDENT_WRITER_KINDS[number])
  ?await dependentStudentGuard(db,table(),draft.studentId):null;
 const item={...key(inst,kind,nextId),...draft,...(kind==='family'?{familyNumber}:{}),...(kind==='student'?{studentNumber,rollNumber}:{}),id:nextId,institution:inst,version:(old?.version||0)+1,createdAt:old?.createdAt||now,updatedAt:now,updatedBy:claims.sub};
 const audit={PK:`AUDIT#${inst}`,SK:`AT#${now}#${randomUUID()}`,entityType:'AUDIT',type:id?'UPDATE':'CREATE',resource:`ops-${kind}`,id:nextId,actorSub:claims.sub,at:now};
 try{await db.send(new TransactWriteCommand({TransactItems:[...(masterGuard?[masterGuard]:[]),...(dependencyGuard?[dependencyGuard]:[]),{Put:{TableName:table(),Item:item,...(old?{ConditionExpression:'#v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':old.version}}:{ConditionExpression:'attribute_not_exists(PK)'})}},{Put:{TableName:table(),Item:audit}}]}));}catch(e:any){if(e.name==='TransactionCanceledException')throw httpError(409,'Record changed; refresh and retry.');throw e;}
 const {PK,SK,...record}=item;return {record};
}
