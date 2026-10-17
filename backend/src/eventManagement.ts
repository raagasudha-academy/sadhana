import {makeRoutedClient} from './tableRouter.ts';
/** Independently managed events. The event creator's identity is taken from verified JWT claims. */
import {randomUUID} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,PutCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import {httpError,permittedInstitutions,viewableInstitutions} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {schedulePK,scheduleSK} from './scheduleModel.ts';
const db=makeRoutedClient();
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('Missing Sadhana table name');return process.env.SADHANA_TABLE_NAME;};
const date=/^\d{4}-\d{2}-\d{2}$/;
const time=/^([01]\d|2[0-3]):[0-5]\d$/;
async function teacherFor(sub:string,inst:InstitutionId){
 const matches:any[]=[];let next:Record<string,any>|undefined;
 do {const res=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':'TEACHER_REGISTRY'},ConsistentRead:true,ExclusiveStartKey:next,Limit:250}));matches.push(...(res.Items||[]).filter(t=>t.active&&t.cognitoSub===sub&&t.institutions?.includes(inst)));next=res.LastEvaluatedKey;if(matches.length>1)throw httpError(409,'Multiple teacher profiles are linked to this account.');}while(next);
 return matches[0];
}
async function actor(inst:InstitutionId,claims:Claims){
 if(!viewableInstitutions(claims).includes(inst))throw httpError(403,'Institution access required.');
 const admin=permittedInstitutions(claims).includes(inst);
 const self=admin?null:await teacherFor(String(claims.sub),inst);
 if(!admin&&!self)throw httpError(403,'Your account must be linked to an active teacher profile to manage events.');
 return {admin,self};
}
async function verifyAssignee(inst:InstitutionId,id:string){
 const res=await db.send(new GetCommand({TableName:table(),Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${id}`},ConsistentRead:true}));
 if(!res.Item?.active||!res.Item.institutions?.includes(inst))throw httpError(400,'Choose an active teacher in this academy.');
 return res.Item;
}
function data(input:Record<string,unknown>,inst:InstitutionId){
 const permitted=['name','programme','eventKind','date','startTime','endTime','mode','location','venueId','teacherId'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!permitted.includes(k)))throw httpError(400,'Invalid event fields.');
 if(input.eventKind!=='class'&&input.eventKind!=='event')throw httpError(400,'Choose an event type.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>150)throw httpError(400,'Enter an event name.');
 if(typeof input.date!=='string'||!date.test(input.date)||Number.isNaN(Date.parse(input.date+'T12:00:00Z')))throw httpError(400,'Choose a valid event date.');
 if(typeof input.startTime!=='string'||typeof input.endTime!=='string'||!time.test(input.startTime)||!time.test(input.endTime)||input.startTime>=input.endTime)throw httpError(400,'Choose a valid same-day time range.');
 for(const field of ['programme','mode','location'])if(typeof input[field]!=='string'||(input[field] as string).length>300)throw httpError(400,`Invalid ${field}.`);
 if(typeof input.venueId!=='string'||input.venueId.length>120)throw httpError(400,'Choose a venue.');
 if(input.eventKind==='event'){
  if(input.programme!=='Event'||input.mode!=='Event'||input.location!==''||input.venueId!==''||input.teacherId!==undefined)
   throw httpError(400,'Events must use the Event programme without a teacher, delivery or venue.');
 }else{
  const allowed=input.eventKind==='class'?(inst==='raaga'?['Singing']:['Vedam','Vedanta']):[];
  if(!allowed.includes(String(input.programme)))throw httpError(400,'Choose a programme permitted for this academy.');
  if(input.mode!=='Online'&&input.mode!=='In person')throw httpError(400,'Choose a delivery mode.');
 }
 if(input.eventKind==='class'&&input.mode==='Online'&&(input.location!=='Online'||input.venueId!==''))throw httpError(400,'Online events must use Online as the venue.');
 if(input.eventKind==='class'&&input.mode!=='Online'&&!input.venueId)throw httpError(400,'Choose an in-person venue.');
 if(input.teacherId!==undefined&&(typeof input.teacherId!=='string'||!/^TEACHER-[0-9a-f-]{36}$/i.test(input.teacherId)))throw httpError(400,'Choose a registered teacher.');
 return input;
}
export async function listManagedEvents(inst:InstitutionId,claims:Claims){
 const {admin,self}=await actor(inst,claims);
 const rows:any[]=[];let next:Record<string,any>|undefined;
 do{const result=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK=:pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ExclusiveStartKey:next,Limit:250}));rows.push(...(result.Items||[]).filter(x=>x.recordType==='special-event'&&x.managedEvent===true));next=result.LastEvaluatedKey;if(rows.length>3000)throw httpError(413,'Too many events.');}while(next);
 return {records:rows.filter(x=>admin||x.teacherId===self!.id).map(({PK,SK,entityType,...r})=>r)};
}
export async function saveManagedEvent(inst:InstitutionId,claims:Claims,input:Record<string,unknown>,id?:string){
 const {admin,self}=await actor(inst,claims);
 const expectedVersion=input.expectedVersion;
 const {expectedVersion:_ignored,...raw}=input;
 const fields=data(raw,inst);
 if(admin&&fields.eventKind==='class'&&!fields.teacherId)throw httpError(400,'Choose a registered teacher.');
 const teacherId=fields.eventKind==='event'?(admin?'':self!.id):admin?String(fields.teacherId):self!.id;
 if(!admin&&fields.teacherId!==undefined&&fields.teacherId!==self!.id)throw httpError(403,'Teachers can assign events only to themselves.');
 const teacher=teacherId?await verifyAssignee(inst,teacherId):null;
 const now=new Date().toISOString();let old:any;
 if(id){
  const res=await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConsistentRead:true}));old=res.Item;
  if(!old||old.managedEvent!==true)throw httpError(404,'Managed event not found.');
  if(old.sharedEvent)throw httpError(409,'Use shared event management for this event.');
  if(!admin&&old.teacherId!==self!.id)throw httpError(403,'You can edit only your own events.');
  if(old.version!==expectedVersion)throw httpError(409,'Event changed; refresh before editing.');
 }else if(expectedVersion!==undefined)throw httpError(400,'Unexpected event version.');
 const record={id:id||`EVT-${randomUUID()}`,institution:inst,recordType:'special-event',managedEvent:true,
  name:String(fields.name).trim(),programme:fields.programme,eventKind:fields.eventKind,teacherId,teacher:teacher?.displayName||'',
  date:fields.date,endDate:fields.date,startTime:fields.startTime,endTime:fields.endTime,allDay:false,
  mode:fields.mode,location:fields.location,venueId:fields.venueId,timezone:'Europe/London',status:'confirmed',version:(old?.version||0)+1,
  createdAt:old?.createdAt||now,createdBy:old?.createdBy||String(claims.sub),updatedAt:now,updatedBy:String(claims.sub)};
 const condition=id?'#v=:old':'attribute_not_exists(PK)';
 try{await db.send(new PutCommand({TableName:table(),Item:{PK:schedulePK(inst),SK:scheduleSK(record.id),entityType:'schedule',...record},ConditionExpression:condition,...(id?{ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':old':old.version}}:{})}));}
 catch(e){if((e as Error).name==='ConditionalCheckFailedException')throw httpError(409,'Event changed; refresh.');throw e;}
 return {record};
}
export async function cancelManagedEvent(inst:InstitutionId,claims:Claims,id:string,expectedVersion:number){
 const {admin,self}=await actor(inst,claims);
 const res=await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConsistentRead:true}));const old=res.Item;
 if(!old||old.managedEvent!==true)throw httpError(404,'Managed event not found.');
  if(old.sharedEvent)throw httpError(409,'Use shared event management for this event.');
 if(!admin&&old.teacherId!==self!.id)throw httpError(403,'You can cancel only your own events.');
 if(old.version!==expectedVersion)throw httpError(409,'Event changed; refresh.');
 const next={...old,status:'cancelled',version:old.version+1,updatedAt:new Date().toISOString(),updatedBy:String(claims.sub)};
 try{await db.send(new PutCommand({TableName:table(),Item:next,ConditionExpression:'#v=:old',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':old':old.version}}));}
 catch(e){if((e as Error).name==='ConditionalCheckFailedException')throw httpError(409,'Event changed; refresh.');throw e;}
 return {record:next};
}

/** Shared calendar entries: atomic mirrored writes, never two independent API requests. */
function requireBothAdmins(claims:Claims){
 const allowed=permittedInstitutions(claims);
 if(!allowed.includes('raaga')||!allowed.includes('sruti'))throw httpError(403,'Shared events require administrator access to both academies.');
}
async function getSharedPair(id:string){
 const [raaga,sruti]=await Promise.all((['raaga','sruti'] as const).map(async inst=>{
  const response=await db.send(new GetCommand({TableName:table(),Key:{PK:schedulePK(inst),SK:scheduleSK(id)},ConsistentRead:true}));
  return response.Item;
 }));
 if(!raaga||!sruti||!raaga.sharedEvent||!sruti.sharedEvent||raaga.id!==sruti.id)
  throw httpError(409,'The shared calendar event pair is incomplete; no changes were made.');
 if(raaga.version!==sruti.version)throw httpError(409,'Shared event versions differ; no changes were made.');
 return [raaga,sruti] as const;
}
export async function saveSharedEvent(claims:Claims,input:Record<string,unknown>,id?:string){
 requireBothAdmins(claims);
 const {expectedVersion,...raw}=input;
 const fields=data(raw,'raaga');
 if(fields.eventKind!=='event')throw httpError(400,'Only Events may be shared across both academies.');
 const old=id?await getSharedPair(id):null;
 if(id&&(!Number.isInteger(expectedVersion)||old![0].version!==expectedVersion))throw httpError(409,'Shared event changed; refresh before editing.');
 if(!id&&expectedVersion!==undefined)throw httpError(400,'Unexpected version.');
 const eventId=id||`EVT-${randomUUID()}`;
 const now=new Date().toISOString();
 const nextVersion=id?old![0].version+1:1;
 const records=(['raaga','sruti'] as const).map((inst,index)=>({
  PK:schedulePK(inst),SK:scheduleSK(eventId),entityType:'schedule',id:eventId,
  institution:inst,recordType:'special-event',managedEvent:true,sharedEvent:true,
  name:String(fields.name).trim(),programme:'Event',eventKind:'event',teacherId:'',teacher:'',
  date:fields.date,endDate:fields.date,startTime:fields.startTime,endTime:fields.endTime,allDay:false,
  mode:'Event',location:'',venueId:'',timezone:'Europe/London',status:old?.[index].status||'confirmed',
  version:nextVersion,createdAt:old?.[index].createdAt||now,createdBy:old?.[index].createdBy||String(claims.sub),
  updatedAt:now,updatedBy:String(claims.sub)
 }));
 try{
  await db.send(new TransactWriteCommand({TransactItems:records.map(record=>({Put:{TableName:table(),Item:record,
    ConditionExpression:id?'#version = :version':'attribute_not_exists(PK)',
    ...(id?{ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':version':Number(expectedVersion)}}:{})
  }}))}));
 }catch(e){if((e as Error).name==='TransactionCanceledException')throw httpError(409,'Shared event conflict; refresh before retrying.');throw e;}
 return {record:records[0],records};
}
export async function cancelSharedEvent(claims:Claims,id:string,expectedVersion:number){
 requireBothAdmins(claims);
 const old=await getSharedPair(id);
 if(!Number.isInteger(expectedVersion)||old[0].version!==expectedVersion)throw httpError(409,'Shared event changed; refresh.');
 const now=new Date().toISOString();
 const updated=old.map(item=>({...item,status:'cancelled',version:item.version+1,updatedAt:now,updatedBy:String(claims.sub)}));
 try{await db.send(new TransactWriteCommand({TransactItems:updated.map(item=>({Put:{TableName:table(),Item:item,
  ConditionExpression:'#version = :version',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':version':expectedVersion}
 }}))}));}
 catch(e){if((e as Error).name==='TransactionCanceledException')throw httpError(409,'Shared event conflict; refresh.');throw e;}
 return {record:updated[0],records:updated};
}
