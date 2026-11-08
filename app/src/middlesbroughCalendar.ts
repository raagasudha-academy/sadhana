export type CalendarEntry = {
 id:string;summary:string;start:string;end:string;location:string;
 status:'confirmed'|'cancelled'|'tentative';institution:'raaga';calendar:'middlesbrough';source:'google';
};
export type CalendarSyncPreview = {
 mode:'preview'; calendar:string; fingerprint:string;
 window:{from:string;through:string};
 counts:{add:number;update:number;cancel:number;unchanged:number;skipped:number};
 examples:CalendarEntry[];
};
export function ukCalendarParts(iso:string):{dateISO:string;time:string}{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
 return {dateISO:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
export function googleCalendarSession(event:CalendarEntry){
 const start=ukCalendarParts(event.start),end=ukCalendarParts(event.end);
 return {
  id:`GOOGLE-${event.id}`,name:event.summary,source:'Google Calendar',institution:'raaga',
  dateISO:start.dateISO,date:new Date(`${start.dateISO}T12:00:00Z`),time:start.time,
  duration:Math.round((Date.parse(event.end)-Date.parse(event.start))/60000),
  endTime:end.time,teacher:'Not assigned in Sadhana',mode:'In Person',venue:event.location||'Refer to original calendar',studentCount:0,
  status:event.status==='cancelled'?'Cancelled':event.status==='tentative'?'Tentative':'Scheduled',
 };
}
