/** M9 opt-in API surface. Does not alter existing API resource routes. */
import {httpError, permittedInstitutions} from '../model.ts';
import type {InstitutionId} from '../model.ts';
import type {DomainRoute} from './http.ts';
import {json} from './http.ts';
import {makeM9TargetReader,makeM9TargetReaderClient,M9_TARGET_KEYS} from '../targetRepository.ts';
import type {M9Entity,M9QueryIndex} from '../targetRepository.ts';

// Disallow cross-institution directory searches. Only explicit institution-partitioned
// indexes can be queried; raw private records are not a general browsing endpoint.
const recordReadEntities=new Set<M9Entity>(['classes','sessions','events','venues','audit']);
const institutionIndexes:Partial<Record<M9Entity,M9QueryIndex>>={
 classes:'InstitutionClassesIndex',sessions:'InstitutionSessionsIndex',
 events:'InstitutionEventsIndex',registrations:'InstitutionRegistrationsIndex',
 audit:'InstitutionAuditIndex'
};
export type M9ApiReader=Pick<ReturnType<typeof makeM9TargetReader>,'get'|'queryIndex'>;
let cachedReader:M9ApiReader|undefined;
function defaultReader():M9ApiReader {
 return cachedReader??=(makeM9TargetReader(makeM9TargetReaderClient(),{enabled:true}));
}
function hasInstitution(item:Record<string,unknown>,institution:InstitutionId,entity:M9Entity){
 return item.institutionId===institution ||
  (Array.isArray(item.institutionIds)&&item.institutionIds.includes(institution)) ||
  // Shared scheduling records can be viewed by a verified admin of either institution.
  (item.institutionId==='shared' && (entity==='sessions'||entity==='events'));
}
export function makeM9Routes(readerFactory:()=>M9ApiReader=defaultReader):DomainRoute {
 return async ({parts,method,query,claims})=>{
  if(parts[0]!=='m9')return undefined;
  // Even when a developer accidentally deploys this route, it remains closed.
  if(process.env.M9_API_ENABLED!=='read-only')return json(404,{error:'Unknown endpoint.'});
  if(method!=='GET')return json(405,{error:'M9 API writes are not enabled.'});
  const admins=permittedInstitutions(claims);
  if(!admins.length)throw httpError(403,'Administrator access required.');
  if(parts.length===2&&parts[1]==='status')return json(200,{
   mode:'read-only',cutover:false,tableCount:Object.keys(M9_TARGET_KEYS).length
  });
  const institution=query.institution;
  if(institution!=='raaga'&&institution!=='sruti')throw httpError(400,'Select a valid institution.');
  if(!admins.includes(institution))throw httpError(403,'Administrator access required for this institution.');
  const entity=parts[2] as M9Entity;
  if(!Object.hasOwn(M9_TARGET_KEYS,entity))return json(404,{error:'Unknown M9 entity.'});
  const reader=readerFactory();
  if(parts.length===4&&parts[1]==='record'){
   // People, families, registrations and learner records require purpose-built access policies.
   if(!recordReadEntities.has(entity))return json(404,{error:'M9 record access not yet available for this entity.'});
   const id=parts[3];
   if(!id||id.length>180)return json(400,{error:'Invalid record identifier.'});
   const item=await reader.get(entity,id);
   if(!item || !hasInstitution(item,institution,entity))return json(404,{error:'Record not found.'});
   return json(200,{record:item});
  }
  if(parts.length===3&&parts[1]==='list'){
   const index=institutionIndexes[entity];
   if(!index)return json(404,{error:'Institution list not available for this entity.'});
   const requestedLimit=Number(query.limit??'50');
   if(!Number.isSafeInteger(requestedLimit)||requestedLimit<1||requestedLimit>100)
    throw httpError(400,'Limit must be between 1 and 100.');
   const page=await reader.queryIndex(entity,index,institution,requestedLimit);
   return json(200,{records:page.items.filter(i=>hasInstitution(i,institution,entity)),hasMore:!!page.lastEvaluatedKey});
  }
  return json(404,{error:'Unknown M9 endpoint.'});
 };
}
export const m9Routes=makeM9Routes();
