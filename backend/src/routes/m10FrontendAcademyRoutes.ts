/** Existing /classes and /venues API, backed directly by M9 tables. No legacy writes or fallback. */
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {demandInstitution,demandViewInstitution,httpError,validate,ALLOWED_FIELDS,newId} from '../model.ts';
import {defaultM95DirectoryReader} from '../m95DirectoryCompatibility.ts';
import {makeM9TargetReader,makeM9TargetReaderClient} from '../m9TargetRepository.ts';
import {makeM9TargetWriter,makeM9TargetWriterClient} from '../m9TargetWriter.ts';

type Entity='classes'|'venues';
type RecordValue=Record<string,any>;
type Dependencies={
 list:(entity:Entity,inst:'raaga'|'sruti',claims:any)=>Promise<{records:RecordValue[];more:boolean}>;
 get:(entity:Entity,id:string)=>Promise<RecordValue|null>;
 create:(entity:Entity,record:RecordValue)=>Promise<RecordValue>;
 update:(entity:Entity,id:string,version:number,changes:RecordValue,inst?:string)=>Promise<RecordValue|null>;
};
let cached:Dependencies|undefined;
function live():Dependencies{
 if(cached)return cached;
 const directory=defaultM95DirectoryReader();
 const reader=makeM9TargetReader(makeM9TargetReaderClient(),{enabled:true});
 const writer=makeM9TargetWriter(makeM9TargetWriterClient(),{enabled:true});
 return cached={
  list:(entity,inst,claims)=>entity==='classes'?directory.classes(inst,claims):directory.venues(inst,claims),
  get:(entity,id)=>reader.get(entity,id),
  create:(entity,record)=>writer.create(entity,record),
  update:(entity,id,version,changes,inst)=>writer.update(entity,id,version,changes,inst),
 };
}
const object=(x:unknown):x is RecordValue=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const legalId=(x:string)=>/^[a-zA-Z0-9_#.:-]{1,180}$/.test(x);
const publicLegacy=(row:RecordValue):RecordValue=>{
 if(!object(row.legacyPayload)||typeof row.legacyPayload.id!=='string')throw Error('M10_COMPAT_LEGACY_PAYLOAD_REQUIRED');
 const {PK,SK,GSI1PK,GSI1SK,GSI2PK,GSI2SK,entityType,...body}=row.legacyPayload;
 return {...body,version:row.version};
};
function allowedChange(entity:Entity,input:RecordValue){
 const allowed=new Set(ALLOWED_FIELDS[entity]);
 if(!Object.keys(input).length||Object.keys(input).some(x=>!allowed.has(x)))throw httpError(400,'Unsupported academy field.');
}
export function makeM10FrontendAcademyRoutes(dependencies:()=>Dependencies=live):DomainRoute{
 return async({parts,method,inst,claims,event})=>{
  if(process.env.M10_FRONTEND_ACADEMY_ROUTING!=='enabled'||!['classes','venues'].includes(parts[0]))return undefined;
  const entity=parts[0] as Entity;
  if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Valid institution required.');
  if(method==='GET'&&parts.length===1){
   if(process.env.M9_TARGET_REPOSITORY_ENABLED!=='read-only')return json(503,{error:'M9 academy reads disabled.'});
   demandViewInstitution(claims,inst);
   return json(200,await dependencies().list(entity,inst,claims));
  }
  if(process.env.M10_ACADEMY_CORE_WRITES!=='enabled'||process.env.M9_TARGET_REPOSITORY_WRITES!=='enabled'||process.env.M9_TARGET_REPOSITORY_ENABLED!=='read-only')
   return json(503,{error:'M9 academy writes disabled.'});
  demandInstitution(claims,inst);
  if(method==='POST'&&parts.length===1){
   const input=readJSON(event.body||'');
   if(!object(input))throw httpError(400,'Invalid academy record.');
   allowedChange(entity,input);
   if(entity==='classes'&&input.institution!==inst)throw httpError(403,'Institution mismatch.');
   const cleaned=validate(entity,input);
   const id=newId(entity==='classes'?'CLASS':'VENUE');
   const now=new Date().toISOString();
   const legacy={...cleaned,id,version:1,createdAt:now,updatedAt:now,archived:false};
   const canonical:RecordValue={
    [entity==='classes'?'classId':'venueId']:id,
    institutionId:inst,
    name:cleaned.name,
    nameSort:cleaned.name.toLocaleLowerCase('en-GB'),
    status:'active',createdAt:now,updatedAt:now,legacyPayload:legacy,
   };
   try {await dependencies().create(entity,canonical);return json(201,{record:legacy});}
   catch(e){if((e as {name?:string}).name==='ConditionalCheckFailedException')return json(409,{error:'Record already exists.'});throw e;}
  }
  if(method==='PATCH'&&parts.length===2){
   const id=parts[1];if(!legalId(id))throw httpError(400,'Invalid record ID.');
   const body=readJSON(event.body||'');
   if(!object(body)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1)throw httpError(400,'Expected version required.');
   const {expectedVersion,...changes}=body;
   allowedChange(entity,changes);
   const previous=await dependencies().get(entity,id);
   if(!previous)return json(404,{error:'Record not found.'});
   // Legacy venues were shared; these cannot be safely edited using institution-scoped
   // conditional M9 updates until their global ownership policy is migrated.
   if(previous.institutionId!==inst)return json(403,{error:'Record is not owned by this institution.'});
   if(previous.version!==expectedVersion)return json(409,{error:'Record changed. Refresh and retry.'});
   const before=publicLegacy(previous);
   if(entity==='classes'&&before.institution!==inst)return json(403,{error:'Class institution mismatch.'});
   if(entity==='classes'&&changes.institution!==undefined&&changes.institution!==inst)return json(403,{error:'Class institution cannot be changed.'});
   // Revalidate only user-editable fields. Stored metadata (id, version, timestamps)
   // must never be passed to the frontend-input validator.
   const editable=Object.fromEntries(ALLOWED_FIELDS[entity].map(key=>[key,Object.hasOwn(changes,key)?changes[key]:before[key]]));
   const merged=validate(entity,editable);
   const now=new Date().toISOString();
   const legacy={...before,...merged,version:expectedVersion+1,updatedAt:now};
   const update:RecordValue={legacyPayload:legacy};
   if(merged.name!==previous.name){update.name=merged.name;update.nameSort=merged.name.toLocaleLowerCase('en-GB');}
   try{
    const result=await dependencies().update(entity,id,expectedVersion,update,inst);
    if(!result)throw Error('M10_NO_UPDATED_ITEM');
    return json(200,{record:publicLegacy(result)});
   }catch(e){if((e as {name?:string}).name==='ConditionalCheckFailedException')return json(409,{error:'Version conflict or institution mismatch.'});throw e;}
  }
  return json(405,{error:'Unsupported academy operation.'});
 };
}
export const m10FrontendAcademyRoutes=makeM10FrontendAcademyRoutes();
