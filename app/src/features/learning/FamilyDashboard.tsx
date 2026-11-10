import {BookOpen,CalendarDays,Check,CircleHelp,NotebookPen,X} from 'lucide-react';
import type {StudentPortalContext} from './useStudentPortalController';

type RsvpIntention='attending'|'not_attending'|'unknown';

export function FamilyDashboard({context}:{context:StudentPortalContext}) {
 const {navigateTo,homework,detail,savingRsvp,changeRsvp,upcomingSessions}=context;
 const nextSession=upcomingSessions[0];
 const intention: RsvpIntention=nextSession?.intention==='attending'||nextSession?.intention==='not_attending'?nextSession.intention:'unknown';
 const rsvpLabel=intention==='attending'?'Attending':intention==='not_attending'?'Not attending':'Not sure yet';
 const rsvpTone=intention==='attending'?'is-yes':intention==='not_attending'?'is-no':'is-undecided';
 const dateLabel=nextSession?new Date(`${nextSession.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'';
 const fullDate=nextSession?new Date(`${nextSession.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'';
 const rsvpOptions:{value:RsvpIntention;label:string;icon:typeof Check;tone:string}[]=[
  {value:'attending',label:'Attending',icon:Check,tone:'is-yes'},
  {value:'not_attending',label:'Not attending',icon:X,tone:'is-no'},
  {value:'unknown',label:'Not sure yet',icon:CircleHelp,tone:'is-undecided'},
 ];
 return <div className="svfd-dashboard">
  <section className="svfd-next" aria-label="Your next class">
   <div className="svfd-next-top">
    <h3><CalendarDays size={19}/> Your next class</h3>
    {nextSession&&<div className="svfd-next-pills"><span className={`svfd-rsvp-pill ${rsvpTone}`}>{intention==='attending'&&<Check size={13} />}{rsvpLabel}</span><span className="svfd-date-pill">{dateLabel}</span></div>}
   </div>
   {!Array.isArray(detail.nextSessions)?<p role="status">Upcoming sessions are unavailable from the API.</p>:nextSession?<div key={nextSession.sessionId}>
    <div className="svfd-next-class-title-row"><h4>{nextSession.className}</h4><div className="svfd-rsvp-actions" role="group" aria-label="Choose your RSVP">
     {rsvpOptions.map(({value,label,icon:Icon,tone})=><button key={value} type="button" className={`svfd-rsvp-option ${tone}${intention===value?' is-selected':''}`} aria-pressed={intention===value} disabled={savingRsvp||intention===value} onClick={()=>void changeRsvp(nextSession.sessionId,value)}><Icon size={15}/>{label}</button>)}
    </div></div>
    {savingRsvp&&<p className="svfd-rsvp-saving" role="status">Saving RSVP…</p>}
    <p className="svfd-session-meta">{fullDate} · {nextSession.startTime||'Time to be confirmed'} UK</p>
   </div>:<p>No upcoming class is scheduled yet.</p>}
  </section>
  {homework.filter(h=>!h.completed&&!h.closed&&h.submissionStatus!=='submitted').slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,1).map(h=><section className="svfd-homework-reminder" key={h.id}><div><span className="svfd-caption">UPCOMING HOMEWORK</span><strong>{h.title}</strong><small>Due {h.dueDate}</small></div><button type="button" className="svfd-outline-btn" onClick={()=>navigateTo('homework')}>View assignment</button></section>)}
  <section className="svfd-actions" aria-label="Quick actions"><h3>Quick actions</h3><div className="svfd-action-grid"><button type="button" onClick={()=>navigateTo('homework')}><BookOpen size={25}/><strong>Homework</strong><span>View assignments and due dates</span><small>View homework →</small></button><button type="button" onClick={()=>navigateTo('practice')}><NotebookPen size={25}/><strong>Practice</strong><span>Record your daily practice</span><small>Log practice →</small></button><button type="button" onClick={()=>navigateTo('calendar')}><CalendarDays size={25}/><strong>Timetable</strong><span>View upcoming class sessions</span><small>View timetable →</small></button></div></section>
 </div>;
}
