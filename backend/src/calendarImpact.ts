/** Read-only impact analysis. This never rewrites calendar sessions. */
import {projectSeriesRecord} from './scheduleSeries.ts';
import type {SeriesRule} from './scheduleSeries.ts';
import type {ScheduleRecord} from './scheduleModel.ts';
export function calculateSeriesImpact(records:readonly ScheduleRecord[],rules:readonly SeriesRule[],candidate:SeriesRule){
 const relevant=records.filter(r=>r.recordType==='class-session'&&r.classId===candidate.classId&&r.institution===candidate.institution&&!!r.date&&r.date>=candidate.effectiveFrom&&(!candidate.effectiveUntil||r.date<=candidate.effectiveUntil));
 const changed:string[]=[];const protectedSessions:string[]=[];
 for(const r of relevant){
  const before=projectSeriesRecord(r,rules);
  const after=projectSeriesRecord(r,[...rules,candidate]);
  const differences=Object.keys(candidate.changes).filter(k=>(before as any)[k] !== (after as any)[k]);
  if(differences.length)changed.push(r.id);
  else if(Object.keys(candidate.changes).some(k=>r.sessionOverrideFields?.includes(k)))protectedSessions.push(r.id);
 }
 const conflicts=rules.filter(r=>r.classId===candidate.classId&&r.institution===candidate.institution&&r.effectiveFrom>=candidate.effectiveFrom&&(!candidate.effectiveUntil||r.effectiveFrom<=candidate.effectiveUntil)&&Object.keys(candidate.changes).some(k=>r.changes[k as keyof typeof r.changes]!==undefined))
 .map(r=>({effectiveFrom:r.effectiveFrom,effectiveUntil:r.effectiveUntil||null,changes:r.changes}));
 return {totalSessions:relevant.length,changedCount:changed.length,changedSessionIds:changed,protectedCount:protectedSessions.length,protectedSessionIds:protectedSessions,overlappingRules:conflicts};
}
