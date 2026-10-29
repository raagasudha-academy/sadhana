/** UK-local homework publishing rules. No database access or side effects. */
export type Schedule = {dueTime:string;dueAt:string;releaseAt:string|null;gradingEnabled:boolean};
const dateRE=/^\d{4}-\d{2}-\d{2}$/;
const timeRE=/^([01]\d|2[0-3]):[0-5]\d$/;
const isoRE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const day=(x:string)=>dateRE.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().startsWith(x);
const parts=(instant:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
/** Resolve UK wall-clock date/time, rejecting nonexistent DST-gap times and preferring first occurrence of an ambiguous hour. */
export function ukLocalToIso(date:string,time:string):string{
 if(!day(date)||!timeRE.test(time))throw new Error('Invalid UK due date or time');
 const target=date+' '+time;const base=Date.parse(`${date}T${time}:00Z`);
 for(const offset of [3600000,0]){
  const ms=base-offset;const p=parts(new Date(ms));
  if(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`===target)return new Date(ms).toISOString();
 }
 throw new Error('UK time is unavailable due to daylight saving change');
}
export function validateHomeworkSchedule(dueDate:unknown,dueTime:unknown,releaseAt:unknown,gradingEnabled:unknown):Schedule{
 if(typeof dueDate!=='string'||!day(dueDate))throw new Error('Valid UK due date required');
 const t=dueTime===undefined?'23:59':dueTime;
 if(typeof t!=='string'||!timeRE.test(t))throw new Error('Invalid due time');
 if(gradingEnabled!==undefined&&typeof gradingEnabled!=='boolean')throw new Error('Invalid grading setting');
 const dueAt=ukLocalToIso(dueDate,t);
 if(releaseAt!==undefined&&releaseAt!==null&&(typeof releaseAt!=='string'||!isoRE.test(releaseAt)||Number.isNaN(Date.parse(releaseAt))))throw new Error('Invalid release timestamp');
 const release=typeof releaseAt==='string'?new Date(releaseAt).toISOString():null;
 if(release&&Date.parse(release)>Date.parse(dueAt))throw new Error('Release cannot follow deadline');
 return {dueTime:t,dueAt,releaseAt:release,gradingEnabled:gradingEnabled===true};
}
export function isHomeworkReleased(h:{releaseAt?:string|null},now=new Date()):boolean{
 return !h.releaseAt||now.getTime()>=Date.parse(h.releaseAt);
}
export function isHomeworkOpenAt(h:{dueDate?:string;dueTime?:string;dueAt?:string|null},now=new Date()):boolean{
 if(typeof h.dueAt==='string'){
  const cutoff=Date.parse(h.dueAt);
  return Number.isFinite(cutoff)&&now.getTime()<=cutoff;
 }
 if(typeof h.dueDate!=='string')return false;
 try{
  const cutoff=Date.parse(ukLocalToIso(h.dueDate,h.dueTime||'23:59'));
  return Number.isFinite(cutoff)&&now.getTime()<=cutoff;
 }catch{
  return false;
 }
}
