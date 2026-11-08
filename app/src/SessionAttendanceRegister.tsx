import './rsvpStatusPills.css';
import {useEffect,useMemo,useState} from 'react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import {eligibleStudentIds} from './operationsSelectors';
import {selectNearbySessions} from './teacherSessionWindow';

type Mark='present'|'absent'|'late'|'excused';
const marks:Mark[]=['present','absent','late','excused'];
export default function SessionAttendanceRegister({cloud,workspace,schedule,students,enrolments,attendance,rsvps=[],onSaved}:{cloud:CloudSession;workspace:InstitutionId;schedule:any[];students:any[];enrolments:any[];attendance:any[];rsvps?:any[];onSaved:()=>Promise<void>}){
 const classes=useMemo(()=>new Map(schedule.filter(s=>s.recordType==='class').map(s=>[s.id,s])),[schedule]);
 const enrolledClasses=new Set(enrolments.filter(e=>!e.archived).map(e=>e.classId));
 const sessions=useMemo(()=>schedule.filter(s=>s.recordType==='class-session'&&classes.has(s.classId)&&enrolledClasses.has(s.classId)).sort((a,b)=>String(b.date).localeCompare(String(a.date))),[schedule,enrolments]);
 const [classId,setClassId]=useState('');
 const availableClasses=[...classes.values()].filter(c=>enrolledClasses.has(c.id));
 const effectiveClass=classId||availableClasses[0]?.id||'';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const classSessions=selectNearbySessions(sessions.filter(s=>s.classId===effectiveClass),today);
 const [sessionId,setSessionId]=useState('');
 const effectiveSessionId=classSessions.some(s=>s.id===sessionId)?sessionId:(classSessions.find(s=>s.windowPosition==='current')?.id||classSessions[0]?.id||'');
 const session=classSessions.find(s=>s.id===effectiveSessionId);
 const eligible=useMemo(()=>session?eligibleStudentIds(enrolments,session.classId,session.date):new Set<string>(),[enrolments,session]);
 const roster=students.filter(s=>eligible.has(s.id)).sort((a,b)=>String(a.rollNumber||a.name).localeCompare(String(b.rollNumber||b.name)));
 const existing=new Map(attendance.filter(a=>a.sessionId===effectiveSessionId).map(a=>[a.studentId,a]));
 const [choices,setChoices]=useState<Record<string,Mark|''>>({});
 const [saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setChoices({});setMessage('');},[effectiveSessionId]);
 const selected=(id:string):Mark|''=>choices[id]??existing.get(id)?.status??'';
 const pending=roster.filter(s=>selected(s.id)&&selected(s.id)!==existing.get(s.id)?.status);
 const unmarked=roster.filter(s=>!selected(s.id));
 async function save(){
  if(!session||saving||unmarked.length||!pending.length)return;
  setSaving(true);setMessage('');let done=0;let failed='';
  for(const student of pending){
   const old=existing.get(student.id);const status=selected(student.id);
   try{
    if(old)await cloud.api.updateOperation('attendance',workspace,old.id,{studentId:student.id,sessionId:session.id,status,note:old.note||''},old.version);
    else await cloud.api.createOperation('attendance',workspace,{studentId:student.id,sessionId:session.id,status,note:''});
    done++;
   }catch(e){failed=student.name+': '+(e instanceof Error?e.message:'save failed');break;}
  }
  try{await onSaved();}catch(e){failed=failed||'Could not refresh attendance. Refresh before retrying.';}
  setChoices({});setMessage(failed?`${done} saved; stopped at ${failed}. Refresh and review the remaining marks before retrying.`:`Saved ${done} attendance marks.`);setSaving(false);
 }
 return <section className="ops-register tw-register" aria-label="Class attendance register">
  <div className="tw-register-heading"><div><h2>Session attendance register</h2><p>Select a class and session, then record each student's attendance.</p></div></div>
  <div className="tw-filter"><label>Class<select aria-label="Select attendance class" value={effectiveClass} onChange={e=>{setClassId(e.target.value);setSessionId('');}}>{availableClasses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="ops-field"><span>Scheduled session</span><select aria-label="Scheduled attendance session" value={effectiveSessionId} onChange={e=>setSessionId(e.target.value)}>{classSessions.map(s=><option key={s.id} value={s.id}>{s.windowPosition==='previous'?'Previous':s.windowPosition==='current'?'Current / upcoming':'Following'} · {s.date}</option>)}</select></label></div>
  {session&&<><div className="tw-register-meta"><strong>{roster.length} students</strong><span>{session.date===today?'Today · attendance can be recorded':session.date<today?'Past session · attendance can be recorded':'Upcoming session · read-only until its date'}</span></div>
   <button type="button" className="reg-secondary tw-mark-all" disabled={saving||session.date>today} onClick={()=>setChoices(old=>Object.fromEntries(roster.map(s=>[s.id,existing.has(s.id)?(old[s.id]??existing.get(s.id).status):'present'])))}>Mark all unrecorded present</button>
   <div className="table-scroll tw-register-table"><table className="data-table"><thead><tr><th>Roll number</th><th>Student</th><th>RSVP</th><th>Attendance</th></tr></thead><tbody>{roster.map(s=><tr key={s.id}><td>{s.rollNumber||'—'}</td><td>{s.name}</td><td>{(()=>{const intention=rsvps.find(r=>r.studentId===s.id&&r.sessionId===effectiveSessionId)?.intention;const status=intention==='attending'?'attending':intention==='not_attending'?'not-attending':intention==='unknown'?'unsure':'no-response';const label=({attending:'Attending','not-attending':'Not attending',unsure:'Not sure','no-response':'No response'} as const)[status];return <span className={`rsvp-status-pill rsvp-status-${status}`}>{label}</span>;})()}</td><td><select aria-label={`Attendance for ${s.name} ${s.rollNumber||s.id}`} value={selected(s.id)} disabled={saving||session.date>today} onChange={e=>setChoices(v=>({...v,[s.id]:e.target.value as Mark|''}))}><option value="">Not marked</option>{marks.map(m=><option value={m} key={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</select></td></tr>)}</tbody></table></div>
   {session.date<=today&&<button type="button" className="reg-primary" disabled={saving||!roster.length||!!unmarked.length||!pending.length} onClick={()=>void save()}>{saving?'Saving…':`Save register (${pending.length} changes)`}</button>}
   {!!unmarked.length&&<p className="tw-register-help">{unmarked.length} students still need an attendance mark.</p>}
   {!roster.length&&<p>No eligible students for this session.</p>}
   {message&&<p role="status">{message}</p>}
  </>}
  {!classSessions.length&&<p className="tw-register-help">No scheduled sessions available for this class.</p>}
 </section>;
}
