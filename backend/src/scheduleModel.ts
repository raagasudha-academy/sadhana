/** Sadhana-native, independently editable academy calendar records. No Google IDs. */
import { createHash } from 'node:crypto';
import { httpError, isoDate } from './model.ts';
export type ScheduleInstitution='raaga'|'sruti'|'shared';
export type ScheduleType='class'|'class-session'|'holiday'|'special-event';
export type ScheduleStatus='confirmed'|'tentative'|'cancelled';
export interface ScheduleRecord {
 id:string;recordType:ScheduleType;institution:ScheduleInstitution;name:string;
 programme:string;teacher:string;mode:string;location:string;date?:string;endDate?:string;
 startTime:string;endTime:string;allDay?:boolean;status?:ScheduleStatus;
 classId?:string;teacherId?:string;sessionOverrideFields?:string[];timezone:'Europe/London';importKey?:string;
 affectsClasses?:boolean;
 version?:number;createdAt?:string;updatedAt?:string;
}
export const schedulePK=(inst:ScheduleInstitution)=>`SCHEDULE#${inst}`;
export const scheduleSK=(id:string)=>`RECORD#${id}`;
export const scheduleIdFromImportKey=(key:string)=>'EVT-'+createHash('sha256').update(key).digest('hex').slice(0,24).toUpperCase();
const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
const timeToMinutes=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
export function validateScheduleRecord(x:ScheduleRecord): ScheduleRecord {
 if(!x||typeof x!=='object'||Array.isArray(x))throw httpError(400,'Expected a schedule record.');
 if(!['raaga','sruti','shared'].includes(x.institution)||!['class','class-session','holiday','special-event'].includes(x.recordType))throw httpError(400,'Invalid institution or record type.');
 if(typeof x.id!=='string'||!/^[-a-zA-Z0-9]{4,90}$/.test(x.id))throw httpError(400,'Invalid Sadhana record ID.');
 if(typeof x.name!=='string'||!x.name.trim()||x.name.length>180)throw httpError(400,'Valid event name required.');
 for(const k of ['programme','teacher','mode','location','startTime','endTime'])if(typeof x[k]!=='string')throw httpError(400,`Invalid ${k}.`);
 if(x.programme.length>100||x.teacher.length>120||x.mode.length>30||x.location.length>300)throw httpError(400,'One or more event fields are too long.');
 if(x.teacherId!==undefined&&(typeof x.teacherId!=='string'||!/^TEACHER-[0-9a-f-]{36}$/i.test(x.teacherId)))throw httpError(400,'Invalid linked teacher ID.');
 if(x.timezone!=='Europe/London')throw httpError(400,'Calendar timezone must be Europe/London.');
 if(x.recordType==='class'){
   if(!timePattern.test(x.startTime)||!timePattern.test(x.endTime)||timeToMinutes(x.endTime)<=timeToMinutes(x.startTime))throw httpError(400,'Invalid master class time.');
   if(x.date||x.allDay||x.classId)throw httpError(400,'Master classes do not have a date or parent class.');
 } else {
   if(!x.date||!isoDate(x.date)||!x.endDate||!isoDate(x.endDate))throw httpError(400,'Valid date and end date are required.');
   if(x.allDay){
     if(x.startTime||x.endTime||x.endDate<=x.date)throw httpError(400,'All-day end date must be exclusive and after start date.');
   } else if(x.endDate!==x.date||!timePattern.test(x.startTime)||!timePattern.test(x.endTime)||timeToMinutes(x.endTime)<=timeToMinutes(x.startTime)){
     throw httpError(400,'Timed events must have a valid same-day time range.');
   }
   if(!['confirmed','tentative','cancelled'].includes(x.status||''))throw httpError(400,'Invalid session status.');
 }
 if(x.recordType==='class-session'&&!x.classId)throw httpError(400,'Session must link to a master class.');
 if(x.recordType!=='class-session'&&x.classId)throw httpError(400,'Only sessions may link to a master class.');
 if(x.recordType==='holiday'&&x.affectsClasses!==false)throw httpError(400,'Imported holidays are informational until explicitly applied.');
 return x;
}
export const scheduleFields=['name','programme','teacher','mode','location','date','endDate','startTime','endTime','status','allDay','teacherId'] as const;
export function scheduleChanges(current:ScheduleRecord,raw:Record<string,unknown>):ScheduleRecord {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw httpError(400,'Expected a schedule edit.');
 const extra=Object.keys(raw).filter(k=>k!=='expectedVersion'&&!scheduleFields.includes(k as any));
 if(extra.length)throw httpError(400,`Fields cannot be changed: ${extra.join(', ')}`);
 const next={...current};
 for(const key of scheduleFields)if(Object.prototype.hasOwnProperty.call(raw,key))(next as any)[key]=raw[key];
 // Master classes have no occurrence date or parent class.
 // Normalise obsolete imported fields before validating an edit.
 if(next.recordType==='class'){
   delete next.date;
   delete next.endDate;
   delete next.classId;
   delete next.allDay;
 }
 return validateScheduleRecord(next);
}
