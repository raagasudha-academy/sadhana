import { CalendarDays, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
const plusDays=(date:Date,days:number)=>{const d=new Date(date);d.setUTCDate(d.getUTCDate()+days);return d;};
const monday=(date:Date)=>plusDays(date,-(date.getUTCDay()+6)%7);
const isoDay=(d:Date)=>d.toISOString().slice(0,10);
const ukMonth=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',month:'long',year:'numeric'}).format(d);
export interface TimetableSession {id:string;name:string;institution:string;dateISO:string;time:string;status:string;source?:string;date:Date;attentionItems?:string[]}
export default function MonthCalendar({month,sessions,onSession,showTime}: {
 month:Date;sessions:TimetableSession[];onSession:(session:any)=>void;showTime:(time:string)=>ReactNode
}){
 const start=monday(new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),1)));
 const finalDay=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0));
 const last=monday(plusDays(finalDay,6));
 const count=Math.min(42,Math.round((last.getTime()-start.getTime())/86400000)+7);
 const days=Array.from({length:count},(_,i)=>plusDays(start,i));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return <div className="sadhana-month-scroll"><div className="sadhana-month-grid" role="grid" aria-label={`Sessions for ${ukMonth(month)}`}>
  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><div className="sadhana-month-weekday" key={day} role="columnheader">{day}</div>)}
  {days.map(date=>{
   const dateISO=isoDay(date);
   const events=sessions.filter(x=>x.dateISO===dateISO);
   return <div role="gridcell" key={dateISO} className={`sadhana-month-day ${date.getUTCMonth()!==month.getUTCMonth()?'is-outside':''} ${dateISO===today?'is-today':''}`}>
    <div className="sadhana-month-date"><span>{date.getUTCDate()}</span>{dateISO===today&&<small>Today</small>}</div>
    {events.slice(0,5).map(item=><button type="button" key={item.id} className={`sadhana-month-event ${item.institution} ${item.status==='Cancelled'?'event-cancelled':''}`} onClick={()=>onSession(item)} title={`${item.name} · ${item.status}${item.attentionItems?.length ? ` · Needs attention: ${item.attentionItems.join('; ')}` : ''}`}><strong>{showTime(item.time)}</strong> {item.name}{item.attentionItems?.length>0&&<span className="sadhana-record-alert sadhana-month-alert" role="img" aria-label={`Needs attention: ${item.attentionItems.join('; ')}`}><CircleAlert size={13}/></span>}{item.source==='Google Calendar'&&<i title="Google Calendar event">G</i>}</button>)}
    {events.length>5&&<small className="sadhana-month-overflow">+{events.length-5} more sessions</small>}
    {!events.length&&<span className="sadhana-month-empty" aria-hidden="true">·</span>}
   </div>;
  })}
 </div><div className="sadhana-month-accessibility"><CalendarDays size={14}/> Select an event for details. Calendar uses UK local time (Europe/London).</div></div>;
}
