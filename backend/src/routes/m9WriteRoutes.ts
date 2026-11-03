/** Opt-in administrator-only M9 preview API writes. No legacy write paths are affected. */
import {httpError,permittedInstitutions} from '../model.ts';
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {makeM9TargetWriter,makeM9TargetWriterClient} from '../m9TargetWriter.ts';
import type {M9Entity} from '../m9TargetRepository.ts';

const WRITABLE=new Set<M9Entity>(['classes','events']);
const CREATE_FIELDS:Record<string,readonly string[]>={
 classes:['classId','institutionId','name','description','subject','level','teacherPersonIds','defaultVenueId','status','createdAt','updatedAt','version','nameSort'],
 events:['eventId','institutionId','title','description','eventType','venueId','startAt','endAt','organiserPersonId','audience','rsvpEnabled','rsvpDeadline','status','createdAt','updatedAt','version']
};
const EDIT_FIELDS:Record<string,readonly string[]>={
 classes:['name','description','subject','level','teacherPersonIds','defaultVenueId','status','nameSort'],
 events:['title','description','eventType','venueId','startAt','endAt','organiserPersonId','audience','rsvpEnabled','rsvpDeadline','status']
};
export type M9ApiWriter=Pick<ReturnType<typeof makeM9TargetWriter>,'create'|'update'>;
let liveWriter:M9ApiWriter|undefined;
const defaultWriter=()=>liveWriter??=(makeM9TargetWriter(makeM9TargetWriterClient(),{enabled:true}));
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const forbidden=(data:Record<string,unknown>,allowed:readonly string[])=>Object.keys(data).filter(k=>!allowed.includes(k));
const safeText=(x:unknown,max=180)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
function validate(entity:M9Entity,item:Record<string,unknown>,isCreate:boolean){
 const extra=forbidden(item,isCreate?CREATE_FIELDS[entity]:EDIT_FIELDS[entity]);
 if(extra.length)throw httpError(400,`Fields are not permitted: ${extra.join(', ')}`);
 if(isCreate){
  const id=entity==='classes'?'classId':'eventId';
  if(!safeText(item[id])||!safeText(item.institutionId))throw httpError(400,'Missing identifier or institution.');
  if(!safeText(entity==='classes'?item.name:item.title,300))throw httpError(400,'Name or title required.');
 }
 if(item.teacherPersonIds!==undefined&&(!Array.isArray(item.teacherPersonIds)||!item.teacherPersonIds.every(x=>safeText(x))))throw httpError(400,'Invalid teacher assignment.');
 if(item.name!==undefined&&!safeText(item.name,300))throw httpError(400,'Invalid class name.');
 if(item.title!==undefined&&!safeText(item.title,300))throw httpError(400,'Invalid event title.');
 if(item.status!==undefined&&!['active','inactive','archived','draft','published','cancelled','completed'].includes(String(item.status)))throw httpError(400,'Invalid status.');
}
export function makeM9WriteRoutes(writerFactory:()=>M9ApiWriter=defaultWriter):DomainRoute{
 return async({parts,method,query,claims,event})=>{
  if(parts[0]!=='m9'||method==='GET')return undefined;
  // Two independent opt-ins. Feature flag absent => no calls to DynamoDB.
  if(process.env.M9_API_WRITES_ENABLED!=='enabled'||process.env.M9_TARGET_REPOSITORY_WRITES!=='enabled')return json(405,{error:'M9 API writes are disabled.'});
  if(!['POST','PATCH'].includes(method??''))return json(405,{error:'Method not allowed.'});
  const institution=query.institution;
  if(institution!=='raaga'&&institution!=='sruti')throw httpError(400,'Select a valid institution.');
  if(!permittedInstitutions(claims).includes(institution))throw httpError(403,'Administrator access required for this institution.');
  const entity=parts[2] as M9Entity;
  if(!WRITABLE.has(entity))return json(405,{error:'M9 write workflow is not supported for this entity.'});
  const body=readJSON(event.body??'');if(!object(body))throw httpError(400,'Invalid request.');
  const writer=writerFactory();
  if(method==='POST'&&parts.length===3&&parts[1]==='record'){
   if(body.institutionId!==institution)throw httpError(403,'Institution mismatch.');
   validate(entity,body,true);
   try {const created=await writer.create(entity,body);return json(201,{record:created});}
   catch(error){if((error as {name?:string}).name==='ConditionalCheckFailedException')return json(409,{error:'Record already exists.'});throw error;}
  }
  if(method==='PATCH'&&parts.length===4&&parts[1]==='record'){
   const id=parts[3];if(!id||id.length>180)throw httpError(400,'Invalid record identifier.');
   const expectedVersion=body.expectedVersion;
   if(typeof expectedVersion!=='number'||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw httpError(400,'expectedVersion must be a positive integer.');
   if(!object(body.changes)||!Object.keys(body.changes).length)throw httpError(400,'changes must be a nonempty object.');
   validate(entity,body.changes,false);
   // IMPORTANT: partition-key scoped condition below prevents cross-academy mutation, see writer.
   try {const changed=await writer.update(entity,id,expectedVersion,body.changes,institution);return json(200,{record:changed});}
   catch(error){if((error as {name?:string}).name==='ConditionalCheckFailedException')return json(409,{error:'Record not found, version conflict or institution mismatch.'});throw error;}
  }
  return json(404,{error:'Unknown M9 endpoint.'});
 };
}
export const m9WriteRoutes=makeM9WriteRoutes();
