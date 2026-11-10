import {BookOpen,CalendarDays,Clock3,MapPin,UserRound} from 'lucide-react';
import type {StudentPortalContext} from './useStudentPortalController';

export function StudentClasses({context}:{context:StudentPortalContext}) {
const {detail,extras,savingRsvp,changeRsvp,canChangeRsvp,setSelectedVenueQuery,navigateTo}=context;
const extraByClass=new Map((extras?.classes||[]).map(item=>[item.classId,item]));
const classSchedule=(classId:string)=>{
 const sessions=(detail.calendarSessions||[]).filter(item=>item.classId===classId&&canChangeRsvp(item));
 const slots=[...new Set(sessions.map(item=>{
  const day=new Date(`${item.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'});
  return `${day} · ${item.startTime||'Time TBC'}`;
 }))];
 return slots.slice(0,3);
};

return <section className="student-experience sv-nav-wide sv-active-registrations">
 <div className="student-experience-intro">
  <div><span className="student-experience-eyebrow">ACTIVE REGISTRATIONS</span><h3>Active Registrations</h3><p>Your current classes, teachers and upcoming schedule.</p></div>
  <span className="student-experience-count">{detail.classes.length} {detail.classes.length===1?'class':'classes'}</span>
 </div>
 {detail.classes.length?<div className="student-experience-grid">
  {detail.classes.map(item=>{
   const profile=extraByClass.get(item.classId);
   const slots=classSchedule(item.classId);
   return <article className="student-experience-card sv-registration-card" key={item.classId}>
    <div className="student-experience-card-top"><span className="student-experience-symbol" aria-hidden="true"><BookOpen size={22}/></span><span className="student-experience-tag">Active</span></div>
    <h4>{item.className}</h4>
    {item.startDate&&<p className="student-experience-card-sub">Enrolled since {new Date(`${item.startDate}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}</p>}
    <dl className="sv-registration-details">
     <div><dt><UserRound size={15}/> Teacher</dt><dd>{profile?.teacher||'To be confirmed'}</dd></div>
     <div><dt><MapPin size={15}/> Location</dt><dd>{profile?.venue?<button type="button" className="sv-registration-venue-link" onClick={()=>{setSelectedVenueQuery(profile.venue);navigateTo('venues');}}>{profile.venue}</button>:'Not listed'}</dd></div>
     <div><dt><Clock3 size={15}/> Class time</dt><dd>{slots.length?slots.join(' · '):'No upcoming time listed'}</dd></div>
    </dl>
   </article>;
  })}
 </div>:<div className="student-experience-empty"><BookOpen size={24}/><strong>No active registrations</strong><p>Your classes will appear here when your enrolment is active.</p></div>}
 <div className="student-experience-sessions-head"><div><h3>Upcoming sessions</h3><p>Next 6 sessions · UK local time. RSVP changes apply to the selected student.</p></div></div>
 {!Array.isArray(detail.nextSessions)?<p role="status">Upcoming sessions are unavailable.</p>:context.upcomingSessions.length?<div className="student-experience-sessions">
  {context.upcomingSessions.map(session=><article className="student-experience-session" key={session.sessionId}>
   <div className="student-experience-date"><strong>{new Date(`${session.date}T12:00:00Z`).toLocaleDateString('en-GB',{day:'2-digit',timeZone:'UTC'})}</strong><span>{new Date(`${session.date}T12:00:00Z`).toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'})}</span></div>
   <div className="student-experience-session-main"><strong>{session.className}</strong><span>{new Date(`${session.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'})} · {session.startTime||'Time to be confirmed'} UK</span></div>
   <label className="sv-nav-rsvp"><span className="sv-nav-rsvp-label">My RSVP</span><select aria-label={`RSVP for ${session.className} on ${session.date}`} disabled={savingRsvp} value={session.intention||'unknown'} onChange={event=>void changeRsvp(session.sessionId,event.target.value as 'attending'|'not_attending'|'unknown')}><option value="unknown">Not sure yet</option><option value="attending">Attending</option><option value="not_attending">Not attending</option></select></label>
  </article>)}
 </div>:<div className="student-experience-empty"><CalendarDays size={22}/><strong>No upcoming sessions</strong><p>New sessions will appear here when scheduled.</p></div>}
</section>;
}
