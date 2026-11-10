import {ClipboardCheck} from 'lucide-react';
import type {StudentPortalContext} from './useStudentPortalController';
import '../../studentUiFinish.css';

export function StudentAttendance({context}:{context:StudentPortalContext}) {
 const {detail}=context;
 const {marks,byClass,counted}=detail.attendance;
 return <section className="student-experience sv-nav-wide sv-attendance-page">
  <header className="student-experience-intro sv-attendance-intro">
   <div><span className="student-experience-eyebrow">LEARNING PARTICIPATION</span><h3>My attendance</h3><p>Attendance recorded for your active classes.</p></div>
   <span className="student-experience-count">{counted} recorded</span>
  </header>

  {byClass.length>0&&<section className="surface reg-section sv-attendance-section" aria-label="Attendance by class">
   <div className="reg-section-head"><div><h2>By class</h2><p>Attendance recorded for each active class.</p></div><span className="reg-count">{byClass.length} {byClass.length===1?'class':'classes'}</span></div>
   <div className="venue-manage-grid sv-attendance-summary">
    {byClass.map(item=><article className="venue-manage-card sv-attendance-class" key={item.classId}>
     <div className="venue-manage-head"><ClipboardCheck size={19} aria-hidden="true"/><strong>{item.className}</strong></div>
     <p>{item.counted>0?`${item.attended} of ${item.counted} sessions attended`:'No attendance recorded yet'}</p>
     <small>{item.percent===null?'Attendance rate unavailable':`${item.percent}% attendance`}</small>
    </article>)}
   </div>
  </section>}

  <section className="surface reg-section sv-attendance-history" aria-label="Recent attendance">
   <div className="reg-section-head"><div><h2>Recent attendance</h2><p>Recorded sessions only.</p></div><span className="reg-count">{marks.length} {marks.length===1?'mark':'marks'}</span></div>
   {marks.length>0?<div className="venue-manage-grid sv-attendance-history-grid">{marks.map((mark,index)=><article className="venue-manage-card sv-attendance-record" key={`${mark.sessionId}-${index}`}>
    <div className="venue-manage-head"><ClipboardCheck size={19} aria-hidden="true"/><strong>{mark.className||'Class'}</strong></div>
    <p>{mark.date||'Date unavailable'}</p>
    <span className={`student-experience-rsvp ${mark.status==='present'||mark.status==='late'?'yes':mark.status==='absent'?'no':'unknown'}`}>{mark.status}</span>
   </article>)}</div>:<div className="reg-empty sv-attendance-no-records" role="status"><ClipboardCheck size={26} aria-hidden="true"/><strong>No attendance recorded yet</strong><p>Your teacher’s attendance marks will appear here.</p></div>}
  </section>
 </section>;
}
