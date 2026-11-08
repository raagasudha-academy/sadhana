export type StudentSession={sessionId:string;date:string;className:string;startTime?:string;intention?:string;additionalSession?:boolean;status?:string};
export function shiftMonth(month:string,by:number){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+by,1));return d.toISOString().slice(0,7)}
export function weekStart(day:string){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
export function shiftWeek(day:string,by:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+by*7);return d.toISOString().slice(0,10)}
export function weekLabel(day:string){const start=weekStart(day);const end=shiftWeek(start,1);const last=new Date(end+'T12:00:00Z');last.setUTCDate(last.getUTCDate()-1);const fmt=(v:string)=>new Date(v+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});return `${fmt(start)} – ${fmt(last.toISOString().slice(0,10))} ${last.getUTCFullYear()}`}
export function monthLabel(month:string){const [y,m]=month.split('-').map(Number);return new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)))}
export function StudentCalendar({sessions,anchor,weekAnchor,mode}:{sessions:StudentSession[];anchor:string;weekAnchor:string;mode:'month'|'week'|'list'}){
 const relevant=sessions.filter(s=>typeof s.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)).slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.startTime||'').localeCompare(String(b.startTime||'')));
 const [year,month]=anchor.split('-').map(Number);
 const first=new Date(Date.UTC(year,month-1,1));const startOffset=(first.getUTCDay()+6)%7;
 const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
 const dates = Array.from(
   { length: Math.ceil((daysInMonth + startOffset) / 7) * 7 },
   (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i - startOffset + 1));
    return d.toISOString().slice(0, 10);
   }
 );
 const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart(weekAnchor)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
 const display=mode==='list'?relevant:mode==='week'?relevant.filter(s=>weekDays.includes(s.date)):relevant.filter(s=>s.date.startsWith(anchor));
 return <>{mode==='month'?<div className="sv1277-month-grid" role="grid" aria-label={monthLabel(anchor)}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div className="sv1277-weekday" key={d}>{d}</div>)}{dates.map(day=>{const entries=relevant.filter(s=>s.date===day);return <div className={`sv1277-calendar-day ${day.startsWith(anchor)?'':'outside'}`} key={day}><span className="sv1277-day-number">{Number(day.slice(-2))}</span>{entries.map(s=><div className="sv1277-calendar-entry" key={s.sessionId} title={`${s.className} · ${s.startTime||'Time TBC'}`}><strong>{s.startTime||'TBC'}</strong> {s.className}{s.additionalSession&&<small aria-label="Additional class session"> · Additional</small>}{s.status==='cancelled'&&<small> · Cancelled</small>}</div>)}</div>})}</div>:mode==='week'?<div className="sv1277-week-list">{weekDays.map(day=><article key={day}><strong>{new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})}</strong>{relevant.filter(s=>s.date===day).map(s=><p key={s.sessionId}>{s.startTime||'TBC'} · {s.className}{s.additionalSession?' · Additional':''}{s.status==='cancelled'?' · Cancelled':''}</p>)}{!relevant.some(s=>s.date===day)&&<span>No scheduled session</span>}</article>)}</div>:null}<h4>Class sessions {mode==='list'?'':mode==='week'?`· ${weekLabel(weekAnchor)}`:`· ${monthLabel(anchor)}`}</h4>{display.length?<div className="sv1277-session-list">{display.map(s=><article key={s.sessionId}><div><strong>{s.className}{s.additionalSession?' · Additional class':''}{s.status==='cancelled'?' · Cancelled':''}</strong><span>{s.date} · {s.startTime||'Time to be confirmed'}</span></div><span>{s.intention==='attending'?'Attending':s.intention==='not_attending'?'Not attending':'Not decided'}</span></article>)}</div>:<p className="sv1277-calendar-empty">No sessions in this view. Try List to see all available class sessions.</p>}<small>Only sessions linked to the selected student’s approved class enrolments are shown.</small></>;
}


