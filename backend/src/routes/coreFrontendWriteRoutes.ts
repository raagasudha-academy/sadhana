/** Existing frontend URLs. M9-only write handler: never fall through when enabled. */
import type {DomainRoute} from './http.ts';
import {json,readJSON} from './http.ts';
import {demandInstitution,httpError} from '../model.ts';
import {m10CoreWriteService} from '../coreWriteService.ts';
import type {CoreEntity} from '../coreWriteService.ts';
const roots=new Set(['students','families','enrolments']);
type Service=Pick<ReturnType<typeof m10CoreWriteService>,'create'|'update'>;
export function makeM10CoreFrontendWriteRoutes(service:()=>Service=m10CoreWriteService):DomainRoute{
 return async({parts,method,inst,claims,event})=>{
  if(!roots.has(parts[0])||!['POST','PATCH'].includes(method??''))return undefined;
  // When the directory is authoritative, never silently write to legacy storage.
  const selected=process.env.M10_CORE_FRONTEND_WRITES==='enabled';
  if(!selected && process.env.M10_CORE_DIRECTORY_ROUTING!=='enabled')return undefined;
  if(!selected||process.env.M10_CORE_DIRECTORY_ROUTING!=='enabled'||process.env.M9_TARGET_REPOSITORY_WRITES!=='enabled'||process.env.M9_TARGET_REPOSITORY_ENABLED!=='read-only')
   return json(503,{error:'M9 core writes are not enabled.'});
  if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Valid institution required.');
  demandInstitution(claims,inst);
  const entity=parts[0] as CoreEntity;
  if(method==='POST'&&parts.length===1){
   const record=await service().create(entity,inst,claims,readJSON(event.body||''));
   return json(201,{record});
  }
  if(method==='PATCH'&&parts.length===2){
   const record=await service().update(entity,inst,claims,parts[1],readJSON(event.body||''));
   return json(200,{record});
  }
  return json(405,{error:'Unsupported core operation.'});
 };
}
export const m10CoreFrontendWriteRoutes=makeM10CoreFrontendWriteRoutes();
