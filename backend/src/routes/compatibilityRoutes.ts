/** Feature-gated compatibility preview. No M9 write access. */
import type {DomainRoute} from './http.ts';
import {json} from './http.ts';
import {demandViewInstitution,permittedInstitutions,viewableInstitutions,httpError} from '../model.ts';
import {listSchedule} from '../scheduleStore.ts';
import {listManagedEvents} from '../eventManagement.ts';
import {canonicalRecords,defaultM95Reader} from '../compatibility.ts';
import type {M95Reader} from '../compatibility.ts';
import type {ScheduleInstitution} from '../scheduleModel.ts';

const modes=new Set(['shadow','pilot']);
const supported=new Set(['schedule','events']);
let live:M95Reader|undefined;
function reader(){return live??=(defaultM95Reader());}
export function makeM95CompatibilityRoutes(getReader:()=>M95Reader=reader):DomainRoute{
 return async({parts,method,query,claims})=>{
  const mode=process.env.M95_COMPAT_MODE;
  if(!modes.has(mode??'')||method!=='GET'||parts.length!==1||!supported.has(parts[0]))return undefined;
  const inst=query.institution;
  if(parts[0]==='schedule'){
   if(!['raaga','sruti','shared'].includes(inst??''))throw httpError(400,'Choose institution=raaga, sruti or shared.');
   if(inst==='shared'){
    if(!viewableInstitutions(claims).length)throw httpError(403,'Staff access required.');
   }else demandViewInstitution(claims,inst as 'raaga'|'sruti');
   if(mode==='pilot')return json(200,await getReader().schedule(inst as ScheduleInstitution));
   const old=await listSchedule(inst as ScheduleInstitution,claims);
   try{
    const next=await getReader().schedule(inst as ScheduleInstitution);
    const same=canonicalRecords(old.records)===canonicalRecords(next.records);
    console.info('M9 shadow schedule comparison',{institution:inst,same,legacyCount:old.records.length,m9Count:next.records.length});
   }catch(error){console.warn('M9 shadow schedule unavailable',{institution:inst,errorName:(error as Error)?.name});}
   return json(200,old);
  }
  // The transferred managed-event payload requires the original access policy.
  // Restrict pilot to administrators; teacher/organiser filtered reads remain on legacy until implemented.
  if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Choose a valid institution.');
  if(!permittedInstitutions(claims).includes(inst))return undefined; // old route retains teacher permissions
  if(mode==='pilot')return json(200,await getReader().managedEvents(inst));
  const old=await listManagedEvents(inst,claims);
  try{
   const next=await getReader().managedEvents(inst);
   console.info('M9 shadow events comparison',{institution:inst,same:canonicalRecords(old.records)===canonicalRecords(next.records),legacyCount:old.records.length,m9Count:next.records.length});
  }catch(error){console.warn('M9 shadow events unavailable',{institution:inst,errorName:(error as Error)?.name});}
  return json(200,old);
 };
}
export const m95CompatibilityRoutes=makeM95CompatibilityRoutes();
