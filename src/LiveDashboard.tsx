import {useEffect,useState} from 'react';
import {CalendarDays,ClipboardCheck,RefreshCw,UsersRound,BookOpen,Inbox} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import './academyOperations.css';

type Snapshot={institution:InstitutionId;students:any[];enrolments:any[];attendance:any[];schedule:any[]};
/** Live dashboard: counts are derived from persisted operations, not the old demo registry. */
export default function LiveDashboard({cloud,workspace,teacherMode,onChangePage}:{cloud:CloudSession;workspace:string;teacherMode:boolean;onChangePage:(page:string)=>void}){
 const [loaded,setLoaded]=useState<{key:string;rows:Snapshot[]}|null>(null);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 const [pending,setPending]=useState<number|null>(null);
 const [pendingError,setPendingError]=useState(false);
 const canReviewIntake=!teacherMode&&workspace==='raaga'&&cloud.staff.institutions.includes('raaga');
 useEffect(()=>{
  let alive=true;
  setPending(null);setPendingError(false);
  if(!canReviewIntake)return ()=>{alive=false;};
  cloud.api.listWebsiteRegistrations({status:'pending',limit:'100'})
   .then(result=>{
    if(!alive)return;
    const value=result as {registrations?:unknown[];records?:unknown[];items?:unknown[];data?:{registrations?:unknown[]}};
    const rows=Array.isArray(result)?result:Array.isArray(value?.registrations)?value.registrations:Array.isArray(value?.records)?value.records:Array.isArray(value?.items)?value.items:value?.data?.registrations;
    if(!Array.isArray(rows))throw new Error('Unexpected registration response');
    setPending(rows.length);
   })
   .catch(()=>{if(alive)setPendingError(true);});
  return ()=>{alive=false;};
 },[cloud.api,canReviewIntake,refresh]);
 useEffect(()=>{
  let live=true;
  const scopes=(workspace==='combined'?cloud.staff.institutions:[workspace]).filter((x):x is InstitutionId=>(x==='raaga'||x==='sruti')&&cloud.staff.institutions.includes(x));
  setBusy(true);setError('');
  Promise.all(scopes.map(async institution=>{
   const [students,enrolments,attendance,schedule]=await Promise.all([
    cloud.api.listOperations('student',institution),cloud.api.listOperations('enrolment',institution),cloud.api.listOperations('attendance',institution),cloud.api.listSchedule(institution)
   ]);
   return {institution,students:students.records,enrolments:enrolments.records,attendance:attendance.records,schedule:schedule.records};
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
 const present=attendance.filter(r=>r.status==='present'||r.status==='late').length;
 const sadhanaMonthlyAttendance=(offset:number)=>{
  const now=new Date();
  const year=now.getFullYear(),month=now.getMonth()+offset;
  const target=new Date(year,month,1);
  const label=target.toLocaleDateString('en-GB',{month:'short',year:'numeric'});
  const prefix=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}`;
  // Attendance events carry sessionId, and the dated schedule is the source of session date.
  const sessionDays=new Map<string,string>();
  for(const scope of data)for(const s of scope.schedule){
   if(s.recordType==='class-session'&&typeof s.id==='string'&&typeof s.date==='string')
    sessionDays.set(`${scope.institution}:${s.id}`,s.date);
  }
  const entries=data.flatMap(scope=>scope.attendance.filter(r=>{
   const day=typeof r.date==='string'?r.date:sessionDays.get(`${scope.institution}:${r.sessionId}`);
   return typeof day==='string'&&day.startsWith(prefix)&&['present','late','absent','excused'].includes(r.status);
  }));
  const attended=entries.filter(r=>r.status==='present'||r.status==='late').length;
  return {label,value:entries.length?`${Math.round(attended*100/entries.length)}%`:'—',count:entries.length};
 };
 const lastMonth=sadhanaMonthlyAttendance(-1);
 const thisMonth=sadhanaMonthlyAttendance(0);

 return <>
  <div className="page-heading"><div><div className="eyebrow">LIVE ACADEMY OVERVIEW</div><h1>{teacherMode?'My teaching dashboard':'Academy dashboard'}</h1><p>{workspace==='combined'?'All authorised academies':workspace==='raaga'?'Raagasudha':'Sruti'} · live DynamoDB records {teacherMode?'· assigned classes only':''}</p></div><button type="button" className="reg-secondary" disabled={busy} onClick={()=>setRefresh(x=>x+1)}><RefreshCw size={16}/> Refresh</button></div>
  {error&&<p role="alert" className="sadhana-sync-error">{error}</p>}
  {busy&&<p role="status">Refreshing live academy records…</p>}
  {(!busy||data.length>0)&&<>
   <div className="ops-summary" aria-label="Persisted academy statistics">
    {canReviewIntake&&<div><span>Pending website registrations</span><strong>{pendingError?'—':pending===null?'…':pending===100?'100+':pending}</strong><small>{pendingError?'Unable to load · refresh to retry':pending===100?'At least 100 pending · open inbox':'Awaiting administrator review'}</small><button type="button" className="reg-secondary" onClick={()=>onChangePage('Website Registrations')}><Inbox size={15}/> Review applications</button></div>}
    <div><span>Active enrolments</span><strong>{activeEnrolments}</strong></div>
    <div><span>Students</span><strong>{students}</strong></div>
    <div><span>Attendance rate</span><strong>{thisMonth.value}</strong><small>Current month · {thisMonth.label} · {thisMonth.count} recorded</small><strong style={{fontSize:'1.25rem',marginTop:8}}>{lastMonth.value}</strong><small>Last month · {lastMonth.label} · {lastMonth.count} recorded</small></div>
   </div>
   <section className="surface" style={{padding:20,marginTop:20}}><h2>Quick actions</h2><div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:14}}>
    <button className="reg-primary" type="button" onClick={()=>onChangePage(teacherMode?'My Students':'Families & Students')}><UsersRound size={16}/> {teacherMode?'My students':'Students & families'}</button>
    <button className="reg-secondary" type="button" onClick={()=>onChangePage(teacherMode?'My Classes':'Classes & Timetable')}><CalendarDays size={16}/> Timetable</button>
    <button className="reg-secondary" type="button" onClick={()=>onChangePage('Practice & Reports')}><ClipboardCheck size={16}/> Practice & reports</button>
   </div></section>
   {data.map(d=><section key={d.institution} className="surface" style={{padding:20,marginTop:16}}><h2><BookOpen size={17} style={{display:'inline',verticalAlign:'middle',marginRight:8}}/>{d.institution==='raaga'?'Raagasudha':'Sruti'}</h2><p>{new Set(d.students.filter(s => !s.archived).map(s => s.id)).size} active students · {d.enrolments.filter(e=>!e.archived).length} active enrolments · {d.schedule.filter(s=>s.recordType==='class').length} master classes</p></section>)}
  </>}
 </>;
}
