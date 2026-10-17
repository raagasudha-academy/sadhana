import {useEffect,useState} from 'react';
import {CalendarDays,ClipboardCheck,RefreshCw,UsersRound,BookOpen} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import './academyOperations.css';

type Snapshot={institution:InstitutionId;students:any[];enrolments:any[];attendance:any[];practice:any[];rsvp:any[];schedule:any[]};
/** Live dashboard: counts are derived from persisted operations, not the old demo registry. */
export default function LiveDashboard({cloud,workspace,teacherMode,onChangePage}:{cloud:CloudSession;workspace:string;teacherMode:boolean;onChangePage:(page:string)=>void}){
 const [loaded,setLoaded]=useState<{key:string;rows:Snapshot[]}|null>(null);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let live=true;
  const scopes=(workspace==='combined'?cloud.staff.institutions:[workspace]).filter((x):x is InstitutionId=>(x==='raaga'||x==='sruti')&&cloud.staff.institutions.includes(x));
  setBusy(true);setError('');
  Promise.all(scopes.map(async institution=>{
   const [students,enrolments,attendance,practice,rsvp,schedule]=await Promise.all([
    cloud.api.listOperations('student',institution),cloud.api.listOperations('enrolment',institution),cloud.api.listOperations('attendance',institution),cloud.api.listOperations('practice',institution),cloud.api.listOperations('rsvp',institution),cloud.api.listSchedule(institution)
   ]);
   return {institution,students:students.records,enrolments:enrolments.records,attendance:attendance.records,practice:practice.records,rsvp:rsvp.records,schedule:schedule.records};
  })).then(rows=>{if(live)setLoaded({key:scopes.join('|'),rows});}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Unable to load live dashboard.');}).finally(()=>{if(live)setBusy(false);});
  return()=>{live=false;};
 },[cloud.api,cloud.staff.institutions.join(','),workspace,refresh]);
 const currentKey=(workspace==='combined'?cloud.staff.institutions:[workspace]).filter(x=>(x==='raaga'||x==='sruti')&&cloud.staff.institutions.includes(x as InstitutionId)).join('|');
 const data=loaded?.key===currentKey?loaded.rows:[];
 const students = new Set(
   data.flatMap(d =>
     d.students
       .filter(s => !s.archived)
       .map(s => s.id)
       .filter(Boolean)
   )
 ).size;
 const activeEnrolments=data.reduce((n,d)=>n+d.enrolments.filter(e=>!e.archived).length,0);
 const attendance=data.flatMap(d=>d.attendance);
 const practice=data.flatMap(d=>d.practice);
 const rsvp=data.flatMap(d=>d.rsvp);
 const sessions=data.reduce((n,d)=>n+d.schedule.filter(s=>s.recordType==='class-session').length,0);
 const present=attendance.filter(r=>r.status==='present'||r.status==='late').length;
 return <>
  <div className="page-heading"><div><div className="eyebrow">LIVE ACADEMY OVERVIEW</div><h1>{teacherMode?'My teaching dashboard':'Academy dashboard'}</h1><p>{workspace==='combined'?'All authorised academies':workspace==='raaga'?'Raagasudha':'Sruti'} · live DynamoDB records {teacherMode?'· assigned classes only':''}</p></div><button type="button" className="reg-secondary" disabled={busy} onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={16}/> Refresh</button></div>
  {error&&<p role="alert" className="sadhana-sync-error">{error}</p>}
  {busy&&<p role="status">Refreshing live academy records…</p>}
  {(!busy||data.length>0)&&<>
   <div className="ops-summary" aria-label="Persisted academy statistics">
    <div><span>Students</span><strong>{students}</strong></div>
    <div><span>Active enrolments</span><strong>{activeEnrolments}</strong></div>
    <div><span>Recorded attendance</span><strong>{attendance.length?`${Math.round(100*present/attendance.length)}%`:'—'}</strong><small>{attendance.length} recorded outcomes</small></div>
    <div><span>Practice entries</span><strong>{practice.length}</strong><small>{practice.reduce((n,r)=>n+(r.didPractice?Number(r.minutes)||0:0),0)} minutes logged</small></div>
    <div><span>RSVP responses</span><strong>{rsvp.filter(r=>r.intention!=='unknown').length}</strong><small>{sessions} scheduled class sessions</small></div>
   </div>
   <section className="surface" style={{padding:20,marginTop:20}}><h2>Academy operations</h2><p>Attendance is measured across recorded outcomes only; unanswered registers are not counted as absences. Practice totals represent logged entries, not an inferred compliance rate.</p><div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:14}}>
    <button className="reg-primary" type="button" onClick={()=>onChangePage(teacherMode?'My Students':'Families & Students')}><UsersRound size={16}/> {teacherMode?'My students':'Manage students & families'}</button>
    <button className="reg-secondary" type="button" onClick={()=>onChangePage(teacherMode?'My Classes':'Classes & Timetable')}><CalendarDays size={16}/> Timetable</button>
    <button className="reg-secondary" type="button" onClick={()=>onChangePage('Practice & Reports')}><ClipboardCheck size={16}/> Practice & reports</button>
   </div></section>
   {data.map(d=><section key={d.institution} className="surface" style={{padding:20,marginTop:16}}><h2><BookOpen size={17} style={{display:'inline',verticalAlign:'middle',marginRight:8}}/>{d.institution==='raaga'?'Raagasudha':'Sruti'}</h2><p>{new Set(d.students.filter(s => !s.archived).map(s => s.id)).size} active students · {d.enrolments.filter(e=>!e.archived).length} active enrolments · {d.schedule.filter(s=>s.recordType==='class').length} master classes</p></section>)}
  </>}
 </>;
}
