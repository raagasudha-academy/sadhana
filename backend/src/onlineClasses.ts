/** Pure, deterministic Sadhana v0.7.4 online class catalogue and date expansion.
 * An active Google "Online Session" marker enables every online class for
 * that *London calendar day*. No marker = no dated class session.
 */
import { createHash } from 'node:crypto';
import { scheduleIdFromImportKey, validateScheduleRecord } from './scheduleModel.ts';
import type { ScheduleRecord, ScheduleInstitution } from './scheduleModel.ts';

export const ONLINE_CALENDAR_ID = 'bb3448f27c7e4657ea99991725b59688075eb8ab1f7d289dad317507663219a8@group.calendar.google.com';
export const ONLINE_SYNC_OWNER = 'online-calendar-v074';
export const SRUTI_EXCEPTION_ID = 'sruti-online-novdec-2026';
export const SRUTI_EXCEPTION_FROM = '2026-11-17';
export const SRUTI_EXCEPTION_THROUGH = '2026-12-03'; // exclusive, includes 2 December
export const ONLINE_SYNC_SOURCE = 'Google: Online Sessions Timetable';
export interface OnlineClass {
  id: string; institution: Exclude<ScheduleInstitution,'shared'>; name: string;
  programme: string; teacher: string; weekday: number; startTime: string; endTime: string;
}
const raagaTeacher='Mrs Praveena Srikailash';
export const ONLINE_CLASSES: readonly OnlineClass[] = Object.freeze([
  {id:'CLASS-RAAGA-ONLINE-SUN-1000',institution:'raaga',name:'Carnatic Music — Ardent Learners',programme:'Carnatic Music',teacher:raagaTeacher,weekday:0,startTime:'10:00',endTime:'11:00'},
  {id:'CLASS-RAAGA-ONLINE-MON-1000',institution:'raaga',name:'Carnatic Music — Monday Morning',programme:'Carnatic Music',teacher:raagaTeacher,weekday:1,startTime:'10:00',endTime:'11:00'},
  {id:'CLASS-RAAGA-ONLINE-WED-1000',institution:'raaga',name:'Carnatic Music — Wednesday Morning',programme:'Carnatic Music',teacher:raagaTeacher,weekday:3,startTime:'10:00',endTime:'11:00'},
  {id:'CLASS-RAAGA-ONLINE-WED-1630',institution:'raaga',name:'Carnatic Music — Wednesday Afternoon',programme:'Carnatic Music',teacher:raagaTeacher,weekday:3,startTime:'16:30',endTime:'17:30'},
  {id:'CLASS-RAAGA-ONLINE-WED-1730',institution:'raaga',name:'Carnatic Music — Wednesday Evening',programme:'Carnatic Music',teacher:raagaTeacher,weekday:3,startTime:'17:30',endTime:'18:30'},
  {id:'CLASS-RAAGA-ONLINE-THU-1100',institution:'raaga',name:'Carnatic Music — Thursday Morning',programme:'Carnatic Music',teacher:raagaTeacher,weekday:4,startTime:'11:00',endTime:'12:00'},
  {id:'CLASS-RAAGA-ONLINE-THU-1730',institution:'raaga',name:'Carnatic Music — Thursday Evening',programme:'Carnatic Music',teacher:raagaTeacher,weekday:4,startTime:'17:30',endTime:'18:30'},
  {id:'CLASS-RAAGA-ONLINE-SAT-0900',institution:'raaga',name:'Carnatic Music — Saturday Morning 1',programme:'Carnatic Music',teacher:raagaTeacher,weekday:6,startTime:'09:00',endTime:'10:00'},
  {id:'CLASS-RAAGA-ONLINE-SAT-1000',institution:'raaga',name:'Carnatic Music — Saturday Morning 2',programme:'Carnatic Music',teacher:raagaTeacher,weekday:6,startTime:'10:00',endTime:'11:00'},
  {id:'CLASS-RAAGA-ONLINE-SAT-1100',institution:'raaga',name:'Carnatic Music — Saturday Morning 3',programme:'Carnatic Music',teacher:raagaTeacher,weekday:6,startTime:'11:00',endTime:'12:00'},
  {id:'CLASS-SRUTI-ONLINE-CHILDREN-G1',institution:'sruti',name:'Vedic Chanting — Children Group 1',programme:'Vedic Chanting',teacher:'Ms Swathi Komaraolu',weekday:4,startTime:'19:30',endTime:'20:30'},
  {id:'CLASS-SRUTI-ONLINE-CHILDREN-G2',institution:'sruti',name:'Vedic Chanting — Children Group 2',programme:'Vedic Chanting',teacher:'Mrs Amruta Hasa',weekday:5,startTime:'20:00',endTime:'21:00'},
  {id:'CLASS-SRUTI-ONLINE-CHILDREN-G3',institution:'sruti',name:'Vedic Chanting — Children Group 3',programme:'Vedic Chanting',teacher:'Mr Vibhas Chengalavala',weekday:1,startTime:'20:00',endTime:'21:00'},
  {id:'CLASS-SRUTI-ONLINE-CHILDREN-G4',institution:'sruti',name:'Vedic Chanting — Children Group 4',programme:'Vedic Chanting',teacher:'Dr Uma Geethanath',weekday:3,startTime:'18:00',endTime:'19:00'},
  {id:'CLASS-SRUTI-ONLINE-CHILDREN-G5',institution:'sruti',name:'Vedic Chanting — Children Group 5',programme:'Vedic Chanting',teacher:'Dr Aishwarya Amarnath',weekday:3,startTime:'17:00',endTime:'18:00'},
]);

export type GoogleMarker = {
 id?:string;summary?:string;status?:string;
 start?:{dateTime?:string;date?:string};end?:{dateTime?:string;date?:string};
};
export function isISODate(value:string): boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(`${value}T12:00:00Z`);
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
}
function londonDate(start: GoogleMarker['start']): string|null {
 if(start?.date && isISODate(start.date)) return start.date;
 if(!start?.dateTime)return null;
 const d=new Date(start.dateTime);
 if(!Number.isFinite(d.valueOf()))return null;
 const bits=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const fields=Object.fromEntries(bits.map(bit=>[bit.type,bit.value]));
 return `${fields.year}-${fields.month}-${fields.day}`;
}
export function markerDates(events:readonly GoogleMarker[],from:string,through:string) {
 const dates=new Set<string>();let skipped=0;let inactive=0;
 for(const e of events){
  if((e.summary||'').trim().toLowerCase()!=='online session'){skipped++;continue;}
  if(e.status!=='confirmed'){inactive++;continue;}
  const day=londonDate(e.start);
  if(!day){skipped++;continue;}
  // One event marks only its own day, regardless of its stated start time.
  if(day>=from&&day<through)dates.add(day);
 }
 return {dates:[...dates].sort(),skipped,inactive};
}
export function masterRecord(c:OnlineClass):ScheduleRecord & {syncOwner:string;onlineWeekday:number} {
 return validateScheduleRecord({id:c.id,recordType:'class',institution:c.institution,name:c.name,programme:c.programme,teacher:c.teacher,mode:'Online',location:'Online',startTime:c.startTime,endTime:c.endTime,timezone:'Europe/London'}) as ScheduleRecord & {syncOwner:string;onlineWeekday:number};
}
export function sessionRecord(c:OnlineClass,date:string):ScheduleRecord & {syncOwner:string} {
 if(!isISODate(date)||new Date(`${date}T12:00:00Z`).getUTCDay()!==c.weekday)throw Error(`Invalid weekday for ${c.id}: ${date}`);
 const importKey=`SADHANA:ONLINE:V074:${c.id}:${date}`;
 return validateScheduleRecord({
  id:scheduleIdFromImportKey(importKey),recordType:'class-session',institution:c.institution,
  classId:c.id,name:c.name,programme:c.programme,teacher:c.teacher,mode:'Online',location:'Online',
  date,endDate:date,startTime:c.startTime,endTime:c.endTime,timezone:'Europe/London',
  status:'confirmed',importKey,allDay:false
 }) as ScheduleRecord & {syncOwner:string};
}
export function makeOnlinePlan(dates:readonly string[]) {
 const unique=[...new Set(dates)].sort();
 const sessions:ScheduleRecord[]=[];
 for(const date of unique){
  if(!isISODate(date))throw Error(`Invalid marker day: ${date}`);
  const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
  for(const c of ONLINE_CLASSES)if(c.weekday===weekday)sessions.push(sessionRecord(c,date));
 }
 return {masters:ONLINE_CLASSES.map(c=>({...masterRecord(c),syncOwner:ONLINE_SYNC_OWNER,onlineWeekday:c.weekday})),
  sessions:sessions.map(s=>({...s,syncOwner:ONLINE_SYNC_OWNER}))};
}
export function googleSnapshotHash(events:readonly GoogleMarker[],from:string,through:string){
 const normalized=events.map(e=>[e.id||'',e.summary||'',e.status||'',e.start?.dateTime||e.start?.date||'',e.end?.dateTime||e.end?.date||''].join('|')).sort();
 return createHash('sha256').update(JSON.stringify([ONLINE_CALENDAR_ID,from,through,normalized])).digest('hex');
}

/** Staff-requested exception to Google day-marker gating.
 * Only Sruti children's groups run on their normal weekdays in this window.
 * Keys intentionally match the Google-generated session keys, so a marker
 * added later never creates a duplicate for the same class and date.
 */
export function makeSrutiExceptionPlan() {
 const dates:string[]=[];
 for(let n=Date.parse(SRUTI_EXCEPTION_FROM+'T12:00:00Z');n<Date.parse(SRUTI_EXCEPTION_THROUGH+'T12:00:00Z');n+=86400000)
  dates.push(new Date(n).toISOString().slice(0,10));
 const classes=ONLINE_CLASSES.filter(c=>c.institution==='sruti');
 const sessions=dates.flatMap(date=>classes.filter(c=>c.weekday===new Date(date+'T12:00:00Z').getUTCDay())
  .map(c=>({...sessionRecord(c,date),syncOwner:ONLINE_SYNC_OWNER,manualException:SRUTI_EXCEPTION_ID})));
 return {masters:classes.map(c=>({...masterRecord(c),syncOwner:ONLINE_SYNC_OWNER,onlineWeekday:c.weekday})),sessions};
}
