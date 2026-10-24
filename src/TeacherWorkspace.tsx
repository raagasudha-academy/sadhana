import PracticeReview from './PracticeReview';
import {useEffect,useMemo,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import {eligibleStudentIds,visibleMasterClasses,visibleDatedSessions} from './operationsSelectors';
import SessionAttendanceRegister from './SessionAttendanceRegister';
import './teacherWorkspace.css';

type Area='attendance'|'students'|'practice'|'history';
const tabs:{id:Area;label:string}[]=[{id:'students',label:'My Students'},{id:'attendance',label:'Attendance'},{id:'practice',label:'Practice'},{id:'history',label:'History'}];
const studentLabel=(s:any)=>`${s.name||'Student'}${s.rollNumber?` · ${s.rollNumber}`:''}`;
export default function TeacherWorkspace({cloud,workspace,initialArea='enrolment'}:{cloud?:CloudSession;workspace:InstitutionId;initialArea?:string}){
 const [area,setArea]=useState<Area>(initialArea==='practice'?'practice':initialArea==='attendance'?'attendance':'students');
 const [students,setStudents]=useState<any[]>([]),[enrolments,setEnrolments]=useState<any[]>([]),[attendance,setAttendance]=useState<any[]>([]),[rsvps,setRsvps]=useState<any[]>([]),[practice,setPractice]=useState<any[]>([]),[schedule,setSchedule]=useState<any[]>([]);
 const [classId,setClassId]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const request=useRef(0);
 const reload=async()=>{if(!cloud)return;const id=++request.current;setBusy(true);setError('');try{
  const [st,en,at,pr,sc,rv]=await Promise.all([cloud.api.listOperations('student',workspace),cloud.api.listOperations('enrolment',workspace),cloud.api.listOperations('attendance',workspace),cloud.api.listOperations('practice',workspace),cloud.api.listSchedule(workspace),cloud.api.listOperations('rsvp',workspace)]);
  if(id!==request.current)return;setStudents(st.records||[]);setEnrolments(en.records||[]);setAttendance(at.records||[]);setRsvps(rv.records||[]);setPractice(pr.records||[]);setSchedule(sc.records||[]);
 }catch(e){if(id===request.current)setError(e instanceof Error?e.message:'Unable to load teaching workspace.');}finally{if(id===request.current)setBusy(false);}};
 useEffect(()=>{void reload();return()=>{request.current++;};},[cloud?.api,workspace]);
 const classes=useMemo(()=>visibleMasterClasses(schedule,enrolments,true),[schedule,enrolments]);
 const sessions=useMemo(()=>visibleDatedSessions(schedule,enrolments,true),[schedule,enrolments]);
 const selectedClass=classes.find(c=>c.id===classId);
 const effectiveClass=selectedClass?.id||classes[0]?.id||'';
 const ids=useMemo(()=>eligibleStudentIds(enrolments,effectiveClass),[enrolments,effectiveClass]);
 const roster=useMemo(()=>students.filter(s=>ids.has(s.id)).sort((a,b)=>String(a.rollNumber||a.name).localeCompare(String(b.rollNumber||b.name))),[students,ids]);
 const visibleRoster=roster.filter(s=>studentLabel(s).toLowerCase().includes(search.toLowerCase()));
 const history=attendance.filter(a=>sessions.some(s=>s.id===a.sessionId&&(!effectiveClass||s.classId===effectiveClass))).sort((a,b)=>String(sessions.find(s=>s.id===b.sessionId)?.date||'').localeCompare(String(sessions.find(s=>s.id===a.sessionId)?.date||'')));
 const studentById=new Map(students.map(s=>[s.id,s]));
 const sessionById=new Map(sessions.map(s=>[s.id,s]));
 return <div className="teacher-workspace"><div className="page-heading"><div><div className="eyebrow">TEACHER WORKSPACE</div><h1>My Teaching</h1><p>{workspace==='sruti'?'Śruti Vedam':'Raagasudha'} · Assigned classes and students</p></div><button type="button" className="reg-secondary" onClick={()=>void reload()} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
  <div className="tw-stats"><div><span>Assigned classes</span><strong>{classes.length}</strong></div><div><span>Enrolled students</span><strong>{new Set(enrolments.filter(e=>!e.archived).map(e=>e.studentId)).size}</strong></div><div><span>Attendance marks</span><strong>{attendance.length}</strong></div><div><span>Practice entries</span><strong>{practice.length}</strong></div></div>
  <section className="surface tw-panel"><nav className="tw-tabs" aria-label="My Teaching sections">{tabs.map(t=><button type="button" key={t.id} className={area===t.id?'active':''} aria-current={area===t.id?'page':undefined} onClick={()=>{setArea(t.id);setSearch('');setError('');setNotice('');}}>{t.label}</button>)}</nav>
  {error&&<p role="alert" className="sadhana-sync-error">{error}</p>}{notice&&<p role="status" className="tw-notice">{notice}</p>}
  {area==='attendance'&&cloud&&<SessionAttendanceRegister cloud={cloud} workspace={workspace} schedule={schedule} students={students} enrolments={enrolments} attendance={attendance} rsvps={rsvps} onSaved={reload}/>}
  {area!=='attendance'&&<div className="tw-content"><div className="tw-filter"><label>Class<select aria-label="Select teaching class" value={effectiveClass} onChange={e=>{setClassId(e.target.value);}}>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{area==='students'&&<label>Find a student<input aria-label="Search students" placeholder="Name or roll number" value={search} onChange={e=>setSearch(e.target.value)}/></label>}</div>
   {!classes.length&&<p role="status">No verified assigned classes are available. Ask an administrator to check your teacher identity and class assignments.</p>}
   {area==='students'&&<><div className="tw-section-head"><h2>Class students</h2><span>{roster.length} enrolled</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Roll number</th><th>Student</th><th>Enrolment</th></tr></thead><tbody>{visibleRoster.map(s=><tr key={s.id}><td>{s.rollNumber||'—'}</td><td><strong>{s.name}</strong></td><td>Active</td></tr>)}{!visibleRoster.length&&<tr><td colSpan={3}>No students found for this class.</td></tr>}</tbody></table></div></>}
   {area==='practice'&&cloud&&<PracticeReview cloud={cloud} workspace={workspace} entries={practice.filter(p=>p.classId===effectiveClass)} students={students} onReload={reload}/>}
   {area==='history'&&<><div className="tw-section-head"><h2>Attendance history</h2><span>{history.length} saved marks</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Session date</th><th>Student</th><th>Roll number</th><th>Mark</th></tr></thead><tbody>{history.map(a=><tr key={a.id}><td>{sessionById.get(a.sessionId)?.date||'—'}</td><td>{studentById.get(a.studentId)?.name||'Student'}</td><td>{studentById.get(a.studentId)?.rollNumber||'—'}</td><td>{a.status}</td></tr>)}{!history.length&&<tr><td colSpan={4}>No attendance saved for this class.</td></tr>}</tbody></table></div><p className="tw-hint">Corrections to saved marks must use the authorised attendance workflow.</p></>}
  </div>}
  </section></div>;
}
