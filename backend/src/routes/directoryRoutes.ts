/** Opt-in M9 directory GET interception; existing staff/venue write routes unchanged. */
import type {DomainRoute} from './http.ts';
import {json} from './http.ts';
import {httpError} from '../model.ts';
import {listTeachers,myTeacherIdentity} from '../teacherDirectory.ts';
import {sameDirectoryRows,defaultM95DirectoryReader} from '../directoryCompatibility.ts';
import type {M95DirectoryReader} from '../directoryCompatibility.ts';
import type {InstitutionId} from '../model.ts';

export type LegacyVenueLookup=(inst:InstitutionId,claims:any)=>Promise<{records:Record<string,any>[];more:boolean}>;
let instance:M95DirectoryReader|undefined;
const reader=()=>instance??=(defaultM95DirectoryReader());

/** Inject venue lookup so unit tests do not need a real repository or DynamoDB. */
export function makeM95DirectoryRoutes(
 getReader:()=>M95DirectoryReader=reader,
 getVenues?:LegacyVenueLookup,
 legacyTeachers:typeof listTeachers=listTeachers,
 legacyTeacherMe:typeof myTeacherIdentity=myTeacherIdentity,
 getClasses?:LegacyVenueLookup,
):DomainRoute{
 return async({parts,method,query,inst,claims})=>{
  const mode=process.env.M95_COMPAT_MODE;
  if((mode!=='shadow'&&mode!=='pilot')||method!=='GET')return undefined;
  const isTeachers=parts[0]==='teachers'&&(parts.length===1||(parts.length===2&&parts[1]==='me'));
  const isVenues=parts[0]==='venues'&&parts.length===1;
  const isClasses=parts[0]==='classes'&&parts.length===1;
  if(!isTeachers&&!isVenues&&!isClasses)return undefined;
  // Until M9 class writes and enrolment integrity are migrated, class reads
  // must never diverge from the legacy authoritative store. Shadow only.
  if(isClasses&&mode!=='shadow')return undefined;
  const institution=query.institution??inst;
  if(institution!=='raaga'&&institution!=='sruti')throw httpError(400,'Choose a valid institution.');
  const scope=institution;
  // Ensure legacy auth is performed in the M9 reader BEFORE any M9 scan.
  if(isTeachers&&parts.length===2){
   if(mode==='pilot')return json(200,await getReader().teacherMe(scope,claims));
   const old=await legacyTeacherMe(scope,claims);
   try{const next=await getReader().teacherMe(scope,claims);console.info('M9 shadow teacher identity',{institution:scope,same:old.linked===next.linked&&old.teacherId===next.teacherId});}
   catch(e){console.warn('M9 shadow teacher identity unavailable',{institution:scope,errorName:(e as Error)?.name});}
   return json(200,old);
  }
  if(isTeachers){
   if(mode==='pilot')return json(200,await getReader().teachers(scope,claims));
   const old=await legacyTeachers(scope,claims);
   try{const next=await getReader().teachers(scope,claims);console.info('M9 shadow teacher directory',{institution:scope,same:sameDirectoryRows(old.records,next.records),legacyCount:old.records.length,m9Count:next.records.length});}
   catch(e){console.warn('M9 shadow teacher directory unavailable',{institution:scope,errorName:(e as Error)?.name});}
   return json(200,old);
  }
  if(isClasses){
   if(!getClasses)throw Error('M95_DIRECTORY_CLASS_LOOKUP_MISSING');
   const old=await getClasses(scope,claims);
   try{const next=await getReader().classes(scope,claims);console.info('M9 shadow class directory',{institution:scope,same:sameDirectoryRows(old.records,next.records),legacyCount:old.records.length,m9Count:next.records.length});}
   catch(e){console.warn('M9 shadow class directory unavailable',{institution:scope,errorName:(e as Error)?.name});}
   return json(200,old);
  }
  if(!getVenues)throw Error('M95_DIRECTORY_VENUE_LOOKUP_MISSING');
  if(mode==='pilot')return json(200,await getReader().venues(scope,claims));
  const old=await getVenues(scope,claims);
  try{const next=await getReader().venues(scope,claims);console.info('M9 shadow venue directory',{institution:scope,same:sameDirectoryRows(old.records,next.records),legacyCount:old.records.length,m9Count:next.records.length});}
  catch(e){console.warn('M9 shadow venue directory unavailable',{institution:scope,errorName:(e as Error)?.name});}
  return json(200,old);
 };
}
