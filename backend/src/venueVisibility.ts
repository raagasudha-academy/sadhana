import {VENUES} from './academyVenues.ts';

type Row=Record<string,any>;
const legacy=(row:Row)=>row.legacyPayload&&typeof row.legacyPayload==='object'?row.legacyPayload:{};
const venueKey=(row:Row)=>{
 const direct=row.venueId||row.id||legacy(row).venueId||legacy(row).id;
 if(direct)return String(direct);
 const pk=String(row.PK||'');
 return pk.startsWith('VENUE#')?pk.slice('VENUE#'.length):'';
};

/**
 * A venue is visible to an academy when that academy has an active class using
 * it, or the venue itself explicitly declares that academy. The imported
 * calendar identities provide the initial class-to-venue association; live
 * class rows extend that mapping, including venues shared across academies.
 */
export function venueIdsForInstitution(inst:'raaga'|'sruti',classes:Row[]=[]):Set<string>{
 const ids=new Set<string>();
 for(const venue of VENUES){
  const belongs=venue.masterIds.some(id=>inst==='raaga'?id.includes('RAAGA'):id.includes('SRUTI'));
  if(belongs)ids.add(venue.id);
 }
 for(const cls of classes){
  if(cls.institutionId!==inst&&cls.institution!==inst&&!(Array.isArray(cls.institutionIds)&&cls.institutionIds.includes(inst))&&legacy(cls).institution!==inst)continue;
  if(['inactive','archived','deleted'].includes(String(cls.status||legacy(cls).status||'').toLowerCase()))continue;
  for(const key of ['defaultVenueId','venueId']){
   const id=String(cls[key]||legacy(cls)[key]||'');
   if(id)ids.add(id);
  }
 }
 return ids;
}

export function filterVenuesForInstitution<T extends Row>(inst:'raaga'|'sruti',venues:T[],classes:Row[]=[]):T[]{
 const ids=venueIdsForInstitution(inst,classes);
 return venues.filter(venue=>{
  const explicit=[venue.institutionId,...(Array.isArray(venue.institutionIds)?venue.institutionIds:[]),legacy(venue).institution]
   .some(value=>value===inst);
  return explicit||ids.has(venueKey(venue));
 });
}

/** Learner directories use the learner's own active classes, never every venue
 * attached to an institution. */
export function venueIdsForClasses(inst:'raaga'|'sruti',classes:Row[]):Set<string>{
 const ids=new Set<string>();
 for(const cls of classes){
  const classInst=cls.institutionId||cls.institution||legacy(cls).institution;
  const classInsts=Array.isArray(cls.institutionIds)?cls.institutionIds:[];
  if(classInst!==inst&&!classInsts.includes(inst))continue;
  if(['inactive','archived','deleted'].includes(String(cls.status||legacy(cls).status||'').toLowerCase()))continue;
  const classId=String(cls.classId||cls.id||legacy(cls).classId||legacy(cls).id||'');
  for(const venue of VENUES){
   if(venue.masterIds.some(id=>id===classId))ids.add(venue.id);
  }
  for(const key of ['defaultVenueId','venueId']){
   const id=String(cls[key]||legacy(cls)[key]||'');
   if(id)ids.add(id);
  }
 }
 return ids;
}

export function filterVenuesForClasses<T extends Row>(inst:'raaga'|'sruti',venues:T[],classes:Row[]):T[]{
 const ids=venueIdsForClasses(inst,classes);
 return venues.filter(venue=>ids.has(venueKey(venue)));
}
