import {useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {CalendarDays,ClipboardCheck,RefreshCw,UsersRound,BookOpen,Inbox,Check,CalendarClock,X,MapPin,Clock3} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import './academyOperations.css';
import './teacherNextClass.css';

type Snapshot={institution:InstitutionId;students:any[];enrolments:any[];attendance:any[];schedule:any[]};
/** Live dashboard: counts are derived from persisted operations, not the old demo registry. */
export default function LiveDashboard({cloud,workspace,teacherMode,onChangePage}:{cloud:CloudSession;workspace:string;teacherMode:boolean;onChangePage:(page:string)=>void}){
 const [loaded,setLoaded]=useState<{key:string;rows:Snapshot[]}|null>(null);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 const [pending,setPending]=useState<number|null>(null);
 const [pendingError,setPendingError]=useState(false);
 const [pendingMore,setPendingMore]=useState(false);
 const [teacherIds,setTeacherIds]=useState<Record<string,string[]>>({});
 const [nextActionBusy,setNextActionBusy]=useState(false);
 const [nextActionError,setNextActionError]=useState('');
 const [cancelConfirm,setCancelConfirm]=useState(false);
 const [rearranging,setRearranging]=useState(false);
 const [nextDate,setNextDate]=useState('');
 const [nextStart,setNextStart]=useState('');
 const [nextEnd,setNextEnd]=useState('');
 const canReviewIntake=!teacherMode&&(workspace==='raaga'||workspace==='sruti')&&cloud.staff.institutions.includes(workspace as InstitutionId);
 useEffect(()=>{
  let alive=true;
  setPending(null);setPendingError(false);setPendingMore(false);
  if(!canReviewIntake)return ()=>{alive=false;};
  // Sruti uses the M9 institution-scoped directory; Raagasudha remains on
  // its existing website registration API until the controlled migration.
  const request=workspace==='sruti'
   ? cloud.api.listSrutiWebsiteRegistrations()
   : cloud.api.listWebsiteRegistrations({status:'pending',limit:'100'});
  request.then(result=>{
    if(!alive)return;
    const value=result as {registrations?:unknown[];records?:unknown[];items?:unknown[];data?:{registrations?:unknown[]};more?:boolean};
    if(workspace==='sruti'){
     // Never show a misleading zero when the old Raagasudha handler responds.
     if(!Array.isArray(value?.records) || value.records.some(row=>{
      const record=row as {institutionId?:unknown;registrationId?:unknown};
      return record?.institutionId!=='sruti'||typeof record.registrationId!=='string';
     }))throw new Error('Unexpected Sruti registration response');
     setPending(value.records.filter(row=>(row as {reviewStatus?:string}).reviewStatus==='pending').length);
     setPendingMore(Boolean(value.more));
     return;
    }
    const rows=Array.isArray(result)?result:Array.isArray(value?.registrations)?value.registrations:Array.isArray(value?.records)?value.records:Array.isArray(value?.items)?value.items:value?.data?.registrations;
    if(!Array.isArray(rows))throw new Error('Unexpected registration response');
    setPending(rows.length);
   }).catch(()=>{if(alive)setPendingError(true);});
  return ()=>{alive=false;};
 },[cloud.api,canReviewIntake,workspace,refresh]);
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
 useEffect(()=>{
  let live=true;
  const scopes=(workspace==='combined'?cloud.staff.institutions:[workspace]).filter((x):x is InstitutionId=>(x==='raaga'||x==='sruti')&&cloud.staff.institutions.includes(x));
  if(!teacherMode){setTeacherIds({});return()=>{live=false;};}
  setTeacherIds({});
  Promise.all(scopes.map(async institution=>({institution,identity:await cloud.api.myTeacherIdentity(institution)})))
   .then(rows=>{if(live)setTeacherIds(Object.fromEntries(rows.filter(x=>x.identity.linked&&x.identity.teacherId).map(x=>[x.institution,[String(x.identity.teacherId)]])));})
   .catch(()=>{if(live)setTeacherIds({});});
  return()=>{live=false;};
 },[cloud.api,cloud.staff.institutions.join(','),workspace,teacherMode]);
 const currentKey=(workspace==='combined'?cloud.staff.institutions:[workspace]).filter(x=>(x==='raaga'||x==='sruti')&&cloud.staff.institutions.includes(x as InstitutionId)).join('|');
 const data=loaded?.key===currentKey?loaded.rows:[];
 const teacherNextSession=useMemo(()=>{
  if(!teacherMode)return null;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const sessions=data.flatMap(scope=>{
   const ids=teacherIds[scope.institution]||[];
   const assignedClasses=new Set(scope.schedule.filter(row=>row.recordType==='class'&&ids.includes(String(row.teacherId||''))).map(row=>row.id));
   return scope.schedule.filter(row=>row.recordType==='class-session'&&row.date&&row.date>=today&&row.status!=='cancelled'&&row.institution!=='shared'&&
    (assignedClasses.has(String(row.classId||''))||ids.includes(String(row.teacherId||'')))).map(row=>({...row,institution:scope.institution}));
  });
  sessions.sort((a,b)=>`${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  return sessions[0]||null;
 },[data,teacherIds,teacherMode]);
 const confirmTeacherAttendance=async()=>{
  if(!teacherNextSession||teacherNextSession.institution==='shared'||!Number.isSafeInteger(teacherNextSession.version))return;
  setNextActionBusy(true);setNextActionError('');
  try{await cloud.api.respondToTeacherSession(teacherNextSession.institution,teacherNextSession.id,Number(teacherNextSession.version));setRefresh(x=>x+1);}
  catch(e){setNextActionError(e instanceof Error?e.message:'Unable to confirm attendance.');}
  finally{setNextActionBusy(false);}
 };
 const cancelTeacherSession=async()=>{
  if(!teacherNextSession||teacherNextSession.institution==='shared'||!Number.isSafeInteger(teacherNextSession.version))return;
  setNextActionBusy(true);setNextActionError('');
  try{await cloud.api.updateSchedule(teacherNextSession.institution,teacherNextSession.id,{status:'cancelled'},Number(teacherNextSession.version));setCancelConfirm(false);setRearranging(false);setRefresh(x=>x+1);}
  catch(e){setNextActionError(e instanceof Error?e.message:'Unable to cancel this class.');}
  finally{setNextActionBusy(false);}
 };
 const rearrangeTeacherSession=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!teacherNextSession||teacherNextSession.institution==='shared'||!Number.isSafeInteger(teacherNextSession.version))return;
  setNextActionBusy(true);setNextActionError('');
  try{await cloud.api.updateSchedule(teacherNextSession.institution,teacherNextSession.id,{date:nextDate,endDate:nextDate,startTime:nextStart,endTime:nextEnd},Number(teacherNextSession.version));setRearranging(false);setRefresh(x=>x+1);}
  catch(e){setNextActionError(e instanceof Error?e.message:'Unable to rearrange this class.');}
  finally{setNextActionBusy(false);}
 };
 const openRearrange=()=>{if(!teacherNextSession)return;setNextDate(String(teacherNextSession.date||''));setNextStart(String(teacherNextSession.startTime||''));setNextEnd(String(teacherNextSession.endTime||''));setRearranging(true);setNextActionError('');};
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
   {teacherMode&&<section className="surface teacher-next-class" aria-label="My next class">
    <div className="teacher-next-class__top"><div className="teacher-next-class__heading"><h2><CalendarDays size={19}/> My next class</h2>{teacherNextSession&&<span className="teacher-next-class__location"><MapPin size={14}/>{teacherNextSession.mode==='online'?'Online':teacherNextSession.location||'Location to be confirmed'}</span>}</div>{teacherNextSession&&<div className="teacher-next-class__top-pills"><span className={`teacher-next-class__status ${teacherNextSession.teacherResponse==='attending'?'is-confirmed':'is-unconfirmed'}`}>{teacherNextSession.teacherResponse==='attending'?<><Check size={13}/> Attending</>:'Needs confirmation'}</span><span className="teacher-next-class__date">{new Date(`${teacherNextSession.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})}</span></div>}</div>
    {!teacherNextSession?<p className="teacher-next-class__empty">{busy?'Loading upcoming classes…':'No upcoming assigned classes.'}</p>:<>
     <div className="teacher-next-class__class-title-row">
      <h3>{teacherNextSession.name}</h3>
      {!rearranging&&<div className="teacher-next-class__actions">
       <button type="button" className="reg-primary" disabled={nextActionBusy||teacherNextSession.teacherResponse==='attending'} onClick={confirmTeacherAttendance}><Check size={15}/>{teacherNextSession.teacherResponse==='attending'?'Attending':'Attend'}</button>
       <button type="button" className="teacher-next-class__cancel" disabled={nextActionBusy} onClick={()=>setCancelConfirm(true)}><X size={15}/> Cancel class</button>
       <button type="button" className="reg-secondary" disabled={nextActionBusy} onClick={openRearrange}><CalendarClock size={15}/> Rearrange</button>
      </div>}
     </div>
     <p className="teacher-next-class__meta"><span><Clock3 size={14}/>{new Date(`${teacherNextSession.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})} · {teacherNextSession.startTime} UK</span><span>{teacherNextSession.institution==='raaga'?'Raagasudha':'Sruti'}</span></p>
     {rearranging?<form className="teacher-next-class__form" onSubmit={rearrangeTeacherSession}>
      <label>Date<input type="date" required value={nextDate} onChange={e=>setNextDate(e.target.value)}/></label>
      <label>Start<input type="time" required value={nextStart} onChange={e=>setNextStart(e.target.value)}/></label>
      <label>End<input type="time" required value={nextEnd} onChange={e=>setNextEnd(e.target.value)}/></label>
      <div><button type="button" className="reg-secondary" disabled={nextActionBusy} onClick={()=>setRearranging(false)}>Back</button><button type="submit" className="reg-primary" disabled={nextActionBusy}>{nextActionBusy?'Saving…':'Save new time'}</button></div>
     </form>:null}
     {nextActionError&&!cancelConfirm&&<p role="alert" className="teacher-next-class__error">{nextActionError}</p>}
    </>}
    {cancelConfirm&&teacherNextSession&&<div className="teacher-next-class__confirm-overlay" onKeyDown={event=>{if(event.key==='Escape'&&!nextActionBusy)setCancelConfirm(false)}} onMouseDown={event=>{if(event.target===event.currentTarget&&!nextActionBusy)setCancelConfirm(false)}}><section className="teacher-next-class__confirm" role="alertdialog" aria-modal="true" aria-labelledby="teacher-cancel-title" aria-describedby="teacher-cancel-description"><header><h2 id="teacher-cancel-title">Cancel this class?</h2><button type="button" aria-label="Close confirmation" disabled={nextActionBusy} onClick={()=>setCancelConfirm(false)}><X size={18}/></button></header><p id="teacher-cancel-description"><strong>{teacherNextSession.name}</strong> will be marked as cancelled, and students will see the change.</p>{nextActionError&&<p role="alert" className="teacher-next-class__error">{nextActionError}</p>}<footer><button type="button" className="reg-secondary" disabled={nextActionBusy} onClick={()=>setCancelConfirm(false)} autoFocus>Keep class</button><button type="button" className="teacher-next-class__cancel-confirm" disabled={nextActionBusy} onClick={()=>void cancelTeacherSession()}>{nextActionBusy?'Cancelling…':'Cancel class'}</button></footer></section></div>}
   </section>}
   <div className="ops-summary" aria-label="Persisted academy statistics">
    {canReviewIntake&&<div><span>Pending website registrations</span><strong>{pendingError?'—':pending===null?'…':pendingMore||pending===100?`${pending}+`:pending}</strong><small>{pendingError?'Unable to load · refresh to retry':pendingMore?'Pending count may be higher · open inbox':pending===100?'At least 100 pending · open inbox':'Awaiting administrator review'}</small><button type="button" className="reg-secondary" onClick={()=>onChangePage('Website Registrations')}><Inbox size={15}/> Review applications</button></div>}
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
