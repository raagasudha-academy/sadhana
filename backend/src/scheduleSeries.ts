/** Effective-dated changes to recurring classes. Rules (not duplicated events)
 * are the source of truth for recurring changes. Earlier class sessions remain
 * untouched, including their IDs and Google day-marker provenance.
 */
import {httpError,isoDate} from './model.ts';
import {validateScheduleRecord} from './scheduleModel.ts';
import type {ScheduleInstitution,ScheduleRecord} from './scheduleModel.ts';
export const SERIES_FIELDS=['teacher','teacherId','startTime','endTime','name','programme','mode','location','status'] as const;
export type SeriesField=typeof SERIES_FIELDS[number];
export type SeriesChanges=Partial<Pick<ScheduleRecord,SeriesField>>;
export interface SeriesRule {
 institution:Exclude<ScheduleInstitution,'shared'>;
 classId:string; effectiveFrom:string; effectiveUntil?:string; changes:SeriesChanges;
 updatedAt:string; updatedBy:string;
}
export const seriesPK=(inst:Exclude<ScheduleInstitution,'shared'>)=>`SCHEDULE_SERIES#${inst}`;
export const seriesSK=(classId:string,date:string)=>`CLASS#${classId}#FROM#${date}`;
/** An effective date belongs to Europe/London, never the viewer's browser timezone. */
export function todayLondon(now:Date=new Date()):string {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const fields=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return `${fields.year}-${fields.month}-${fields.day}`;
}
export function parseSeriesChange(input:Record<string,unknown>,master:ScheduleRecord,fromToday=todayLondon()): {effectiveFrom:string;effectiveUntil?:string;changes:SeriesChanges;expectedVersion:number} {
 if(!input||typeof input!=='object'||Array.isArray(input))throw httpError(400,'Expected a series change object.');
 const allowed=['effectiveFrom','effectiveUntil','expectedVersion','changes'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw httpError(400,'Unsupported series change field.');
 if(!Number.isInteger(input.expectedVersion)||input.expectedVersion!==master.version)throw httpError(409,'The class has changed. Refresh before editing its series.');
 const effectiveFrom=input.effectiveFrom;
 if(typeof effectiveFrom!=='string'||!isoDate(effectiveFrom)||effectiveFrom<fromToday)throw httpError(400,'Choose today or a future UK date for series changes.');
 const effectiveUntil=input.effectiveUntil;
 if(effectiveUntil!==undefined&&(typeof effectiveUntil!=='string'||!isoDate(effectiveUntil)||effectiveUntil<effectiveFrom))throw httpError(400,'End date must be a valid UK date on or after the start date.');
 const raw=input.changes;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw httpError(400,'Choose at least one class change.');
 const payload=raw as Record<string,unknown>;
 const keys=Object.keys(payload);
 if(!keys.length||keys.some(k=>!SERIES_FIELDS.includes(k as SeriesField)))throw httpError(400,'Unsupported series change field.');
 const changes:SeriesChanges={};
 for(const key of keys as SeriesField[]){
  if(typeof payload[key]!=='string')throw httpError(400,`${key} must be text.`);
  (changes as Record<string,string>)[key]=(payload[key] as string).trim();
 }
 if('teacher'in changes&&!changes.teacher)throw httpError(400,'Teacher cannot be blank.');
 if('name'in changes&&!changes.name)throw httpError(400,'Class name cannot be blank.');
 if('programme'in changes&&!changes.programme)throw httpError(400,'Programme cannot be blank.');
 if('mode'in changes&&!changes.mode)throw httpError(400,'Delivery cannot be blank.');
 if('status'in changes&&!['confirmed','tentative','cancelled'].includes(changes.status||''))throw httpError(400,'Invalid class status.');
 if('teacherId'in changes&&(!changes.teacher||!/^TEACHER-[0-9a-f-]{36}$/i.test(changes.teacherId||'')))throw httpError(400,'Teacher ID requires a matching teacher name.');
 return {effectiveFrom,effectiveUntil:effectiveUntil as string|undefined,changes,expectedVersion:master.version!};
}
/** Combine rules in chronological order. One-off changes win over recurring rules. */
export function projectSeriesRecord(record:ScheduleRecord,rules:readonly SeriesRule[],today=todayLondon()):ScheduleRecord {
 const isMaster=record.recordType==='class';
 if(!isMaster&&record.recordType!=='class-session')return record;
 const classId=isMaster?record.id:record.classId;
 const date=isMaster?today:record.date;
 if(!classId||!date)return record;
 const patches=rules.filter(x=>x.institution===record.institution&&x.classId===classId&&x.effectiveFrom<=date&&(!x.effectiveUntil||date<=x.effectiveUntil))
  .sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 if(!patches.length)return record;
 const exceptions=new Set(record.sessionOverrideFields||[]);
 const values:SeriesChanges={};
 for(const rule of patches)Object.assign(values,rule.changes);
 const applied={...record};
 for(const key of SERIES_FIELDS){
  if(values[key]===undefined)continue;
  if(!isMaster&&(exceptions.has(key)||(key==='teacherId'&&exceptions.has('teacher'))))continue;
  (applied as any)[key]=values[key];
 }
 // A legacy name-only teacher change must never inherit a stale master teacherId.
 const lastTeacherRule=patches.filter(x=>x.changes.teacher!==undefined).at(-1);
 if(lastTeacherRule&&!lastTeacherRule.changes.teacherId){
   if(isMaster||!exceptions.has('teacher'))delete applied.teacherId;
 }
 if(!isMaster&&exceptions.has('teacher')&&!record.teacherId)delete applied.teacherId;
 return validateScheduleRecord(applied);
}
/** Validate at every transition: beginning and the day after a bounded rule ends.
 * The latter is essential because the previously applicable schedule resumes. */
export function validateSeriesCandidate(master:ScheduleRecord,existingRules:readonly SeriesRule[],newRule:SeriesRule){
 const all=[...existingRules,newRule];
 const dates=new Set<string>([newRule.effectiveFrom]);
 const nextDay=(day:string)=>{const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);};
 for(const rule of all.filter(x=>x.classId===master.id)){
  if(rule.effectiveFrom>=newRule.effectiveFrom)dates.add(rule.effectiveFrom);
  if(rule.effectiveUntil){const after=nextDay(rule.effectiveUntil);if(after>=newRule.effectiveFrom)dates.add(after);}
 }
 for(const day of dates)validateScheduleRecord(projectSeriesRecord(master,all,day));
}
