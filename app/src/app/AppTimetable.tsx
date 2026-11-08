import { teacherIdentityFailureMessage } from "../teacherIdentityMessages";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Filter, GraduationCap, List, Plus, Search, X, Trash2 } from "lucide-react";
import { institutions } from "../institutions";
import { scheduleAttentionIssues } from "../scheduleAttention";
import MonthCalendar from "../MonthCalendar";
import { calendarScopes, filterCalendarResponses } from "../workspacePolicy";
import { ukToday, addDays, mondayOf, ukDate, displayTime, Pill, PageHeader, EmptyState, ClassCalendar, teacherNameKey, matchingRegistryTeacher } from "./appShared";
import { ManagedEvents } from "./AppManagedEvents";

export function Timetable({ workspace, isTeacher, classView, setClassView, onSession, cloud, revision, venues }: any) {
  const [search,setSearch]=useState('');
  const [createSessionOpen,setCreateSessionOpen]=useState(false);
  const [createSessionClass,setCreateSessionClass]=useState('');
  const [createSessionDate,setCreateSessionDate]=useState('');
  const [createSessionStart,setCreateSessionStart]=useState('10:00');
  const [createSessionEnd,setCreateSessionEnd]=useState('11:00');
  const [createSessionError,setCreateSessionError]=useState('');
  const [createSessionBusy,setCreateSessionBusy]=useState(false);
  const [masterStatusFilter,setMasterStatusFilter]=useState<'all'|'active'|'paused'|'archived'>('all');
  const [lifecycleBusy,setLifecycleBusy]=useState(false);
  const [lifecycleError,setLifecycleError]=useState('');
  const [lifecycleConfirm,setLifecycleConfirm]=useState<null|'paused'|'archived'>(null);
  const [selectedCalendarClass,setSelectedCalendarClass]=useState('');
  const [eventOpen,setEventOpen]=useState<any>(null);
  const [anchor,setAnchor]=useState(ukToday);
  const [records,setRecords]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [apiError,setApiError]=useState('');
  const [refreshCounter,setRefreshCounter]=useState(0);
  const [master,setMaster]=useState<any|null>(null);
  const [editingMaster,setEditingMaster]=useState(false);
  const [classRoster,setClassRoster]=useState<any[]>([]);
  const [classDetailsTab,setClassDetailsTab]=useState<'details'|'roster'>('details');
  const [rosterSearch,setRosterSearch]=useState('');
  const [classRosterError,setClassRosterError]=useState('');
  useEffect(()=>{
    if(!master||!cloud){setClassRoster([]);return;}
    let active=true;setClassRosterError('');setClassRoster([]);
    Promise.all([cloud.api.listOperations('enrolment',master.institution),cloud.api.listOperations('student',master.institution)])
      .then(([enrolments,students])=>{if(!active)return;const memberById=new Map(students.records.map((m:any)=>[m.id,m]));
        setClassRoster(enrolments.records.filter((e:any)=>e.classId===master.id&&!e.archived).map((e:any)=>({enrolment:e,student:memberById.get(e.studentId)})));})
      .catch((error:Error)=>{if(active)setClassRosterError(error.message||'Roster not available for this account.');});
    return()=>{active=false;};
  },[master?.id,cloud?.api]);
  const [masterForm,setMasterForm]=useState<any>({});
  const [seriesFrom,setSeriesFrom]=useState('');
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [masterReview,setMasterReview]=useState(false);
  const [registeredTeachers,setRegisteredTeachers]=useState<Array<{id:string;displayName:string;active:boolean}>>([]);
  useEffect(()=>{
   if(!master||!cloud||isTeacher){setRegisteredTeachers([]);return;}
   let alive=true;
   cloud.api.listTeachers(master.institution).then(result=>{if(alive)setRegisteredTeachers(result.records.filter(t=>t.active));})
    .catch(()=>{if(alive)setRegisteredTeachers([]);});
   return()=>{alive=false;};
  },[master?.id,cloud?.api,isTeacher]);
  const view=classView==='calendar'?'week':classView;
  const start=view==='week'?mondayOf(anchor):new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth(),1,12));
  const rangeStart=view==='week'?start:mondayOf(start);
  const rangeEnd=view==='week'?addDays(start,6):addDays(mondayOf(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12))),6);
  const insts=calendarScopes(workspace, cloud?.staff.institutions ?? []);
  useEffect(()=>{
    let alive=true;
    if(!cloud || insts.length===0){setRecords([]);setLoading(false);return;}
    setRecords([]);setLoading(true);setApiError('');
    Promise.all(insts.map(async (institution) => ({
      institution,
      ...(await cloud.api.listSchedule(institution)),
    })))
      .then((all)=>{if(alive)setRecords(filterCalendarResponses(all,workspace,cloud.staff.institutions));})
      .catch((error:Error)=>{if(alive){setRecords([]);setApiError(error.message.includes('Unknown endpoint')?'The v0.7 calendar API has not yet been deployed.':error.message);}})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[cloud?.api,workspace,revision,refreshCounter]);
  const [assignedTeacherIds,setAssignedTeacherIds]=useState<string[]>([]);
  const [teacherScopeError,setTeacherScopeError]=useState('');
  useEffect(()=>{
    if(!isTeacher||!cloud){setAssignedTeacherIds([]);setTeacherScopeError('');return;}
    let active=true;setAssignedTeacherIds([]);setTeacherScopeError('');
    Promise.all(insts.filter(institution=>institution==='raaga'||institution==='sruti').map(async institution=>({institution,identity:await cloud.api.myTeacherIdentity(institution)})))
      .then(all=>{if(!active)return;
        const linked=all.filter(({identity})=>identity.linked&&identity.teacherId).map(({identity})=>String(identity.teacherId));
        setAssignedTeacherIds([...new Set(linked)]);
        if(!linked.length)setTeacherScopeError('No active registered teacher profile is linked to this login for the selected academy. Ask an administrator to verify your teacher link.');
      })
      .catch((error:unknown)=>{if(active){setAssignedTeacherIds([]);setTeacherScopeError(teacherIdentityFailureMessage(error));}});
    return()=>{active=false;};
  },[isTeacher,cloud?.api,cloud?.staff.subject,workspace]);
  const classes=records.filter(r=>r.recordType==='class'&&(!isTeacher||assignedTeacherIds.includes(r.teacherId)));
  const noLinkedClasses=isTeacher&&!loading&&!apiError&&!teacherScopeError&&assignedTeacherIds.length>0&&classes.length===0;
  const lifecycleByClass=new Map(classes.map((c:any)=>[c.id,c.lifecycleStatus||'active']));
  const currentUkDate=ukToday().toISOString().slice(0,10);
  const activeCalendarRecords=records.filter((r:any)=>{
    // v13.7.7 teacher-owned standalone calendar visibility
    if(isTeacher){
      const linkedToAssignedMaster=classes.some((c:any)=>c.id===(r.recordType==='class'?r.id:r.classId));
      // Standalone dated classes do not have a master classId. They are visible
      // ONLY when the backend record is explicitly attributed to this login's
      // verified teacher registry ID. Never infer ownership from the name.
      const ownStandalone=!!r.managedEvent && !r.classId &&
        assignedTeacherIds.includes(String(r.teacherId||'')) &&
        insts.includes(r.institution);
      if(!linkedToAssignedMaster&&!ownStandalone)return false;
    }
    if(!r.classId)return true;
    const state=lifecycleByClass.get(r.classId);
    return state!=='archived'||(r.date&&r.date<currentUkDate);
  });
  const addTeacherSession=async()=>{
    if(!cloud||!isTeacher)return;
    const cls=classes.find((c:any)=>c.id===createSessionClass);
    if(!cls||!insts.includes(cls.institution)){setCreateSessionError('Choose one of your assigned classes.');return;}
    if(!createSessionDate||createSessionStart>=createSessionEnd){setCreateSessionError('Choose a date and valid start/end times.');return;}
    setCreateSessionBusy(true);setCreateSessionError('');
    try{
      await cloud.api.createSchedule(cls.institution,{recordType:'class-session',classId:cls.id,name:cls.name,
        programme:cls.programme||'',mode:cls.mode||'',location:cls.location||'',
        date:createSessionDate,endDate:createSessionDate,startTime:createSessionStart,endTime:createSessionEnd,
        status:'confirmed',allDay:false});
      setCreateSessionOpen(false);setRefreshCounter(n=>n+1);
    }catch(error){setCreateSessionError(error instanceof Error?error.message:'Unable to create session.');}
    finally{setCreateSessionBusy(false);}
  };
  const orderedCalendarClasses=[...classes].sort((a:any,b:any)=>
    String(a.name||'').localeCompare(String(b.name||''),'en-GB') || String(a.institution||'').localeCompare(String(b.institution||'')));
  // A workspace change must not leave an inaccessible class filter selected.
  useEffect(()=>{setSelectedCalendarClass('');},[workspace]);
  const knownVenueIds: ReadonlySet<string> | undefined = venues.length ? new Set<string>(venues.map((v:any)=>String(v.id))) : undefined;
  const classIssueCount=classes.filter(c=>scheduleAttentionIssues(c,knownVenueIds).length>0).length;
  const expand=(record:any)=>{
    const dates:string[]=[];
    if(record.allDay){
      let d=new Date(`${record.date}T12:00:00Z`);
      const limit=new Date(`${record.endDate}T12:00:00Z`);
      for(let count=0;d<limit&&count<400;count++,d=addDays(d,1)){
        const day=d.toISOString().slice(0,10);
        if(day>=rangeStart.toISOString().slice(0,10)&&day<=rangeEnd.toISOString().slice(0,10))dates.push(day);
      }
    }else dates.push(record.date);
    const linkedVenue=venues.find((v:any)=>v.id===record.venueId);
    const attentionItems=scheduleAttentionIssues(record,knownVenueIds);
    return dates.map(day=>({
      venueId:record.venueId,venueAddress:linkedVenue?.address||record.location||'',
      id:record.id+'-'+day,recordId:record.id,expectedVersion:record.version,recordType:record.recordType,classId:record.classId,seriesMasterVersion:classes.find(c=>c.id===record.classId)?.version,
      name:record.name,programme:record.programme,institution:record.institution,dateISO:day,
      date:new Date(`${day}T12:00:00Z`),time:record.allDay?'00:00':record.startTime,endTime:record.endTime,
      duration:record.allDay?0:(Number(record.endTime?.slice(0,2))*60+Number(record.endTime?.slice(3)))-(Number(record.startTime?.slice(0,2))*60+Number(record.startTime?.slice(3))),
      allDay:record.allDay,endDate:record.endDate,teacher:record.teacher||'Not assigned',mode:record.mode||'Event',venue:linkedVenue?.name||record.location||'—',
      status:record.status==='cancelled'?'Cancelled':record.status==='tentative'?'Tentative':'Scheduled',
      studentCount:0,sadhana:true,original:record,attentionItems
    }));
  };
  const openCalendarItem=(s:any)=>s.original?.managedEvent?setEventOpen({record:s.original}):onSession(s);
  const sessions=activeCalendarRecords.filter(r=>r.recordType!=='class').flatMap(expand)
    .filter(s=>s.dateISO>=rangeStart.toISOString().slice(0,10)&&s.dateISO<=rangeEnd.toISOString().slice(0,10))
    .map((s:any)=>lifecycleByClass.get(s.classId)==='paused'&&s.dateISO>=currentUkDate&&s.status==='Scheduled'?{...s,status:'Paused'}:s)
    .sort((a,b)=>a.dateISO.localeCompare(b.dateISO)||a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
  // Display-only filter. All records, master classes and API responses remain untouched.
  const visibleSessions=selectedCalendarClass
    ? sessions.filter((s:any)=>s.classId===selectedCalendarClass)
    : sessions;
  const shift=(dir:number)=>setAnchor((value:Date)=>view==='week'?addDays(value,dir*7):new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+dir,Math.min(value.getUTCDate(),28),12)));
  const rangeLabel=view==='week'?`${ukDate(start,{day:'numeric',month:'short'})} – ${ukDate(addDays(start,6),{day:'numeric',month:'short',year:'numeric'})}`:ukDate(start,{month:'long',year:'numeric'});
  const openMaster=(r:any)=>{setClassDetailsTab('details');setRosterSearch('');setEditingMaster(false);setMasterDeleteReview(null);setMasterDeleteError('');setMasterReview(false);setMaster(r);setMasterForm({name:r.name,teacher:r.teacher,teacherId:r.teacherId||'',programme:r.programme,mode:r.mode,location:r.location,startTime:r.startTime,endTime:r.endTime});setSeriesFrom(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));setSaveError('');};
  const [masterDeleteReview,setMasterDeleteReview]=useState<any>(null);
  const [masterDeleteBusy,setMasterDeleteBusy]=useState(false);
  const [masterDeleteError,setMasterDeleteError]=useState('');
  const reviewMasterDeletion=async()=>{
    if(!cloud||!master||isTeacher)return;
    setMasterDeleteBusy(true);setMasterDeleteError('');
    try{setMasterDeleteReview(await cloud.api.previewDeleteMasterClass(master.institution,master.id,master.version));}
    catch(e){setMasterDeleteError(e instanceof Error?e.message:'Unable to preview class deletion.');}
    finally{setMasterDeleteBusy(false);}
  };
  const confirmMasterDeletion=async()=>{
    if(!cloud||!master||isTeacher||!masterDeleteReview)return;
    setMasterDeleteBusy(true);setMasterDeleteError('');
    try{
      await cloud.api.deleteMasterClass(master.institution,master.id,master.version,masterDeleteReview.signature);
      setMasterDeleteReview(null);setMaster(null);setRefreshCounter(n=>n+1);
    }catch(e){setMasterDeleteReview(null);setMasterDeleteError(e instanceof Error?e.message:'Unable to delete class. Refresh and preview again.');}
    finally{setMasterDeleteBusy(false);}
  };
  const updateLifecycle=async(status:'active'|'paused'|'archived')=>{
    if(!cloud||!master||isTeacher)return;
    setLifecycleBusy(true);setLifecycleError('');
    try{
      await cloud.api.setMasterLifecycle(master.institution,master.id,status,master.version);
      setLifecycleConfirm(null);setMaster(null);setRefreshCounter(n=>n+1);
    }catch(e){setLifecycleError(e instanceof Error?e.message:'Unable to update class status.');}
    finally{setLifecycleBusy(false);}
  };
  const saveMaster=async()=>{
    if(!master||!cloud||isTeacher)return;
    setSaving(true);setSaveError('');
    try{
      const registry=registeredTeachers.find(t=>t.id===masterForm.teacherId)
       || matchingRegistryTeacher(masterForm.teacher||'',registeredTeachers);
      const changed=Object.fromEntries(Object.entries(masterForm).filter(([k,v])=>k!=='teacherId'&&v!==master[k]));
      const seriesChanges=Object.fromEntries(Object.entries(changed).filter(([k])=>['teacher','startTime','endTime'].includes(k)));
      const otherChanges=Object.fromEntries(Object.entries(changed).filter(([k])=>!['teacher','startTime','endTime'].includes(k)));
      if(Object.keys(seriesChanges).length&&Object.keys(otherChanges).length)throw new Error('Save name/programme/location changes separately from teacher/time series changes.');
      if(Object.keys(seriesChanges).length){
        if(seriesChanges.teacher){
          if(!registry||registry.displayName!==masterForm.teacher)throw new Error('Select an active registered teacher.');
          seriesChanges.teacherId=registry.id;
        }
        await cloud.api.updateScheduleSeries(master.institution,master.id,seriesChanges,seriesFrom,master.version);
      }else if(Object.keys(otherChanges).length){
        await cloud.api.updateSchedule(master.institution,master.id,otherChanges,master.version);
      }else if(!master.teacherId&&master.teacher&&registry&&teacherNameKey(registry.displayName)===teacherNameKey(master.teacher)){
        if(!masterReview){setMasterReview(true);return;}
        await cloud.api.linkTeacherIdentity(master.institution,master.id,{teacherId:registry.id,expectedVersion:master.version});
      }else throw new Error('No changes to save. To link an effective-dated assignment, edit a dated session from the calendar.');
      setMaster(null);setRefreshCounter(n=>n+1);
    }catch(e){setSaveError(e instanceof Error?e.message:'Unable to save this class.');}
    finally{setSaving(false);}
  };
  const linkedRegistryTeacher=registeredTeachers.find(t=>t.id===masterForm.teacherId)
   || matchingRegistryTeacher(masterForm.teacher||'',registeredTeachers);
  const baselineLinkOnly=!!master&&!master.teacherId&&!!master.teacher&&!!linkedRegistryTeacher
   &&teacherNameKey(linkedRegistryTeacher.displayName)===teacherNameKey(master.teacher)
   &&Object.entries(masterForm).every(([k,v])=>k==='teacherId'||v===master[k]);
  return <>
    <PageHeader kicker="LIVE" title="Academy Calandar" description={loading?'Loading calendar…':`${records.filter(x=>x.recordType!=='class').length} dated entries · ${classes.length} master classes · ${records.filter(x=>x.recordType==='special-event').length} events`} right={<Pill>Time Zone: Europe/London</Pill>}/>
    {apiError&&<p className="sadhana-sync-error" role="alert">{apiError}</p>}{isTeacher&&teacherScopeError&&<p className="sadhana-sync-error" role="alert">{teacherScopeError}</p>}{noLinkedClasses&&<p className="sadhana-sync-error" role="status">Your teacher login is verified, but no master classes in this academy reference your registered teacher ID. An administrator can review the master-class assignment; existing class records have not been changed.</p>}
    {isTeacher&&!!cloud&&classes.length>0&&<section className="surface" style={{padding:16,marginBottom:12}}>
      <button type="button" className="reg-secondary" onClick={()=>setCreateSessionOpen(v=>!v)}><Plus size={15}/> {createSessionOpen?'Close session form':'Add session to assigned class'}</button>
      {createSessionOpen&&<form className="reg-form" onSubmit={e=>{e.preventDefault();void addTeacherSession();}} style={{marginTop:14}}>
        <label className="reg-field"><span>Assigned class</span><select required value={createSessionClass} onChange={e=>{const id=e.target.value;setCreateSessionClass(id);const chosen=classes.find((c:any)=>c.id===id);if(chosen){setCreateSessionStart(chosen.startTime||'10:00');setCreateSessionEnd(chosen.endTime||'11:00');}}}>
          <option value="">Select class</option>{classes.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="reg-field"><span>Date</span><input type="date" required value={createSessionDate} onChange={e=>setCreateSessionDate(e.target.value)}/></label>
        <label className="reg-field"><span>Start</span><input type="time" required value={createSessionStart} onChange={e=>setCreateSessionStart(e.target.value)}/></label>
        <label className="reg-field"><span>End</span><input type="time" required value={createSessionEnd} onChange={e=>setCreateSessionEnd(e.target.value)}/></label>
        {createSessionError&&<p role="alert" className="sadhana-sync-error">{createSessionError}</p>}
        <button className="reg-primary" disabled={createSessionBusy} type="submit">{createSessionBusy?'Saving…':'Create session'}</button>
      </form>}
    </section>}
    {!loading&&!apiError&&classIssueCount>0&&<p className="sadhana-attention-summary"><CircleAlert size={15}/> {classIssueCount} master class{classIssueCount===1?' needs':'es need'} attention · Select a red icon to see missing details.</p>}
    {!loading&&!apiError&&records.length===0&&<p>No calendar records found for this workspace.</p>}
    <section className="surface calendar-surface"><div className="calendar-toolbar"><div className="week-controls"><button className="icon-button" title="Previous period" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><div><strong>{rangeLabel}</strong><span>{view==='week'?'Weekly timetable':'Monthly timetable'}</span></div><button className="icon-button" title="Next period" onClick={()=>shift(1)}><ChevronRight size={18}/></button><button className="today-button" onClick={()=>setAnchor(ukToday())}>Today</button></div><div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:12}}><label className="sadhana-calendar-class-filter" style={{display:'inline-flex',alignItems:'center',gap:8,margin:0}}>
  <span style={{fontSize:13,fontWeight:600,color:'#596781',whiteSpace:'nowrap'}}>Class</span>
  <select aria-label="Filter calendar by class" value={selectedCalendarClass} onChange={e=>setSelectedCalendarClass(e.target.value)} style={{appearance:'auto',WebkitAppearance:'menulist',minWidth:170,maxWidth:250,width:'min(31vw,250px)',height:36,padding:'6px 12px',border:'1px solid #cdd6e5',borderRadius:10,background:'#fff',color:'#354765',fontSize:13,fontWeight:500,cursor:'pointer'}}>
    <option value="">All classes &amp; events</option>
    {orderedCalendarClasses.map((c:any)=><option key={`${c.institution}:${c.id}`} value={c.id}>{workspace==='combined'?`${institutions[c.institution]?.name||c.institution} · `:''}{c.name}</option>)}
  </select>
</label><button type="button" onClick={()=>setEventOpen({})} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,padding:'7px 12px',borderRadius:999,border:'1px solid #cdd6e5',background:'#fff',color:'#354765',fontSize:13,fontWeight:600,lineHeight:'20px',cursor:'pointer',whiteSpace:'nowrap'}}><Plus size={14}/> Add Event</button><div className="segmented"><button className={view==='week'?'selected':''} onClick={()=>setClassView('week')}><CalendarDays size={15}/> Week</button><button className={view==='month'?'selected':''} onClick={()=>setClassView('month')}><CalendarDays size={15}/> Month</button><button className={view==='list'?'selected':''} onClick={()=>setClassView('list')}><List size={15}/> List</button></div></div></div>
      {view==='week'?<ClassCalendar classes={classes} start={start} sessions={visibleSessions} onSession={openCalendarItem}/>:view==='month'?<MonthCalendar month={start} sessions={visibleSessions} onSession={openCalendarItem} showTime={(x:string)=>x==='00:00'?'All day':displayTime(x)}/>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Session</th><th>Date & time</th><th>Teacher / Programme</th><th>Mode / Location</th><th>Status</th><th/></tr></thead><tbody>{visibleSessions.map((s:any)=><tr key={s.id}><td><button className="plain-link sadhana-attention-list-name" onClick={()=>openCalendarItem(s)}>{s.name}{s.attentionItems?.length>0&&<span className="sadhana-record-alert" role="img" aria-label={`Needs attention: ${s.attentionItems.join('; ')}`} title={s.attentionItems.join(' · ')}><CircleAlert size={16}/></span>}</button></td><td>{ukDate(s.date,{weekday:'short',day:'numeric',month:'short'})}, {s.allDay?'All day':displayTime(s.time)}</td><td>{s.teacher} · {s.programme}</td><td>{s.venue}{s.venueId&&<small style={{display:'block'}}>{s.venueAddress}</small>}</td><td><Pill tone={s.status==='Cancelled'?'red':'green'}>{s.status}</Pill></td><td><button className="icon-only" onClick={()=>openCalendarItem(s)} aria-label={`View ${s.name}`}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table>{!visibleSessions.length&&<EmptyState title="No sessions this period" detail="Try another month or check that the one-time migration has been applied."/>}</div>}
      <div className="calendar-footer"><span><i className="key-color raaga"/> Raagasudha</span><span><i className="key-color sruti"/> Śruti Vedam</span><span><i className="key-color cancelled"/> Cancelled</span><span>Select any event to view and edit it.</span></div>
    </section>
    <style>{`
/* sadhana-master-status-filter: master-class directory status controls */
.class-roster-list .surface-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.class-roster-list .surface-heading>div:first-child{margin-right:auto}
.sadhana-master-filter-field{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#58677e;white-space:nowrap}
.sadhana-master-status-filter{height:37px;min-width:130px;max-width:165px;border-radius:9px;border:1px solid #d5deea;background:#fff;color:#34445e;font-family:inherit;font-size:12px;font-weight:500;padding:7px 28px 7px 11px;cursor:pointer}
.sadhana-master-status-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;line-height:1.2;white-space:nowrap;text-transform:capitalize;background:#e7f4ec;color:#257047;border:1px solid #c3e5ce}
.sadhana-master-status-pill.paused{background:#fff3de;color:#8d621c;border-color:#f1d9ab}
.sadhana-master-status-pill.archived{background:#edf0f5;color:#657186;border-color:#dce2eb}
.class-tile .sadhana-tile-end{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:540px){.sadhana-master-filter-field{width:100%}.sadhana-master-status-filter{flex:1;max-width:none}}
`}</style><section className="surface class-roster-list"><div className="surface-heading"><div><h2>Master class directory</h2><p>Live master classes across in-person and online teaching.</p></div><label className="sadhana-master-filter-field sadhana-master-class-filter"><span>Class</span><select aria-label="Filter master directory by class" value={selectedCalendarClass} onChange={e=>setSelectedCalendarClass(e.target.value)}><option value="">All classes</option>{orderedCalendarClasses.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="sadhana-master-filter-field"><span>Status</span><select className="sadhana-master-status-filter" aria-label="Filter master classes by status" value={masterStatusFilter} onChange={e=>setMasterStatusFilter(e.target.value as 'all'|'active'|'paused'|'archived')}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label><label className="class-list-search"><Search size={15}/><input aria-label="Search classes" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search classes" /></label></div>
    <div className="class-card-grid">{classes.filter(c=>!selectedCalendarClass||c.id===selectedCalendarClass).filter(c=>masterStatusFilter==='all'||(c.lifecycleStatus||'active')===masterStatusFilter).filter(c=>`${c.name} ${c.teacher} ${c.location}`.toLowerCase().includes(search.toLowerCase())).map(c=>{
      const issues=scheduleAttentionIssues(c,knownVenueIds);
      return <button className="class-tile" key={c.id} onClick={()=>openMaster(c)}><span className="tile-top"><span className="class-mark"><GraduationCap size={19}/></span><span className="sadhana-tile-end"><span className={`sadhana-master-status-pill ${c.lifecycleStatus||'active'}`}>{c.lifecycleStatus==='paused'?'Paused':c.lifecycleStatus==='archived'?'Archived':'Active'}</span>{issues.length>0&&<span className="sadhana-record-alert" role="img" aria-label={`Needs attention: ${issues.join('; ')}`} title={issues.join(' · ')}><CircleAlert size={18}/></span>}<ArrowUpRight size={16}/></span></span><strong>{c.name}</strong><small>{displayTime(c.startTime)} – {displayTime(c.endTime)}</small><span className="class-tile-meta">{c.teacher||'Teacher unassigned'} · {c.mode}</span><small>{venues.find((v:any)=>v.id===c.venueId)?.name||c.location}</small><span className="tile-foot">{records.filter(x=>x.classId===c.id).length} sessions <span>View details <ArrowRight size={14}/></span></span></button>;
    })}</div>
    {!classes.length&&<EmptyState title="No master classes imported" detail="They will appear when the one-time import is complete."/>}
    </section>
    <ManagedEvents cloud={cloud} workspace={workspace} isTeacher={isTeacher} venues={venues} openRequest={eventOpen} onClose={()=>setEventOpen(null)} onChanged={async()=>{setRefreshCounter(n=>n+1);}}/>
    {master&&<div className="reg-shade"><section className="reg-modal sadhana-master-editor" role="dialog" aria-modal="true" aria-label={editingMaster?'Edit master class':'Class details'}>
<style>{`
.sadhana-master-editor .sadhana-lifecycle-panel{border:1px solid #dfe5ee;border-radius:12px;padding:16px;margin:18px 0 12px;display:grid;gap:14px;background:#fff}
.sadhana-master-editor .sadhana-lifecycle-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}
.sadhana-master-editor .sadhana-lifecycle-heading strong{font-size:15px;font-weight:700;color:#29364b}
.sadhana-master-editor .sadhana-lifecycle-heading p{font-size:12px;line-height:1.55;color:#697791;margin:5px 0 0}
.sadhana-master-editor .sadhana-lifecycle-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:#eaf0fa;color:#465e89;white-space:nowrap}
.sadhana-master-editor .sadhana-lifecycle-badge.paused{background:#fff3df;color:#8f6220}
.sadhana-master-editor .sadhana-lifecycle-badge.archived{background:#f4e8eb;color:#995060}
.sadhana-master-editor .sadhana-lifecycle-actions{display:flex;gap:8px;flex-wrap:wrap}
.sadhana-master-editor .sadhana-lifecycle-actions button{font-size:12px!important;min-height:36px;padding:8px 13px!important;margin:0!important}
.sadhana-master-editor .sadhana-lifecycle-confirm{display:grid;gap:12px;border-top:1px solid #e7ebf2;padding-top:14px}
.sadhana-master-editor .sadhana-lifecycle-confirm strong{font-size:13px;color:#2d3b50}
.sadhana-master-editor .sadhana-lifecycle-confirm p{font-size:12px;line-height:1.5;color:#697791;margin:5px 0 0}
.sadhana-master-editor .sadhana-lifecycle-confirm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.sadhana-master-editor .sadhana-lifecycle-confirm-actions button{font-size:12px!important;min-height:36px;padding:8px 12px!important;margin:0!important}
.sadhana-master-editor .sadhana-master-footer{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important;margin-top:18px!important;padding-top:16px;border-top:1px solid #e7ebf2}
.sadhana-master-editor .sadhana-master-footer-right{display:flex;gap:8px;margin-left:auto}
.sadhana-master-editor .sadhana-master-footer button{font-size:12px!important;min-height:38px!important;padding:8px 12px!important;margin:0!important;width:auto!important;flex:0 1 auto!important;white-space:nowrap}
@media(max-width:480px){.sadhana-master-editor .sadhana-master-footer>.reg-danger{width:100%!important}.sadhana-master-editor .sadhana-master-footer-right{width:100%;display:grid;grid-template-columns:1fr 1fr}.sadhana-master-editor .sadhana-master-footer-right button{width:100%!important}}
`}</style>
<div className="reg-modal-head"><div><h2>{editingMaster?'Edit master class':'Class details'}</h2><p>{master.name}</p></div><button className="reg-icon-btn" onClick={()=>setMaster(null)} aria-label="Close"><X size={18}/></button></div><div className="sadhana-class-tabs" role="tablist" aria-label="Class details sections"><button type="button" role="tab" aria-selected={classDetailsTab==='details'} onClick={()=>setClassDetailsTab('details')}>Class details</button><button type="button" role="tab" aria-selected={classDetailsTab==='roster'} onClick={()=>setClassDetailsTab('roster')}>Student roster ({classRoster.length})</button></div>{classDetailsTab==='roster'?<section className="sadhana-class-roster" role="tabpanel" aria-label="Class student roster"><input aria-label="Search class roster" placeholder="Search by student or roll number" value={rosterSearch} onChange={e=>setRosterSearch(e.target.value)}/>{classRosterError?<p role="alert">{classRosterError}</p>:<div className="sadhana-roster-scroll"><table><thead><tr><th>Roll number</th><th>Student</th></tr></thead><tbody>{classRoster.filter(({student}:any)=>`${student?.name||''} ${student?.rollNumber||''}`.toLowerCase().includes(rosterSearch.toLowerCase())).map(({enrolment,student}:any)=><tr key={enrolment.id}><td>{student?.rollNumber||'—'}</td><td>{student?.name||'Student record unavailable'}</td></tr>)}</tbody></table>{!classRoster.length&&<p>No current enrolments found.</p>}</div>}</section>:<form className="reg-form" onSubmit={e=>{e.preventDefault();if(editingMaster)void saveMaster();}}>{scheduleAttentionIssues(master,knownVenueIds).length>0&&<div className="sadhana-record-issues" role="note"><CircleAlert size={18}/><div><strong>Class details need attention</strong><ul>{scheduleAttentionIssues(master,knownVenueIds).map(issue=><li key={issue}>{issue}</li>)}</ul><small>Based on saved details. The warning clears after the correction is saved and refreshed.</small></div></div>}{(['name','programme','teacher','mode','location','startTime','endTime'] as const).map(k=><label key={k} className="sadhana-edit-field"><span>{k==='startTime'?'Start time':k==='endTime'?'End time':k}</span>{k==='teacher'&&!isTeacher&&editingMaster?<select aria-label="Assigned registered teacher" value={masterForm.teacherId||matchingRegistryTeacher(masterForm.teacher||'',registeredTeachers)?.id||''} onChange={e=>{const t=registeredTeachers.find(t=>t.id===e.target.value);setMasterReview(false);setMasterForm((v:any)=>({...v,teacher:t?.displayName||'',teacherId:t?.id||''}));}}>
 <option value="">Choose registered teacher</option>
 {registeredTeachers.map(t=><option value={t.id} key={t.id}>{t.displayName}</option>)}
 </select>:<input readOnly={!editingMaster||isTeacher} type={k==='startTime'||k==='endTime'?'time':'text'} maxLength={k==='location'?300:120} value={masterForm[k]||''} onChange={e=>{setMasterReview(false);setMasterForm((v:any)=>({...v,[k]:e.target.value}));}}/>}</label>)}<label className="sadhana-edit-field"><span>Teacher/time changes effective from (UK date)</span><input type="date" value={seriesFrom} onChange={e=>{setMasterReview(false);setSeriesFrom(e.target.value);}} readOnly={!editingMaster||isTeacher}/></label><p className="reg-footnote">Teacher and time changes apply from this date to every future session in this class, including online sessions created later. Name, programme and location changes must be saved separately.</p>{saveError&&<p role="alert" className="sadhana-sync-error">{saveError}</p>}{masterReview&&baselineLinkOnly&&<div className="sadhana-inline-review" role="status"><CircleAlert size={19}/><div><strong>Review teacher link</strong><p>Link {linkedRegistryTeacher?.displayName} to {master.name}? This stores the teacher identity only. No dated sessions or teacher names will change.</p><button type="button" className="sadhana-review-back" onClick={()=>setMasterReview(false)}>Back to editing</button></div></div>}{!isTeacher&&editingMaster&&<section className="sadhana-lifecycle-panel" aria-label="Class lifecycle">
  <div className="sadhana-lifecycle-heading">
    <div><strong>Class lifecycle</strong><p><b>Active</b> — classes run as scheduled. <b>Paused</b> — temporarily on hold; resume when ready. <b>Archived</b> — finished or discontinued; hidden from the active calendar. History is retained.</p></div>
    <span className={`sadhana-lifecycle-badge ${master.lifecycleStatus||'active'}`}>{master.lifecycleStatus||'active'}</span>
  </div>
  <div className="sadhana-lifecycle-actions">
    {master.lifecycleStatus==='paused'||master.lifecycleStatus==='archived'
      ? <button type="button" className="reg-secondary" disabled={lifecycleBusy} onClick={()=>void updateLifecycle('active')}>{master.lifecycleStatus==='archived'?'Restore class':'Resume class'}</button>
      : <button type="button" className="reg-secondary" disabled={lifecycleBusy} onClick={()=>setLifecycleConfirm('paused')}>Pause class</button>}
    {master.lifecycleStatus!=='archived'&&<button type="button" className="reg-secondary" disabled={lifecycleBusy} onClick={()=>setLifecycleConfirm('archived')}>Archive class</button>}
  </div>
  {lifecycleConfirm&&<div className="sadhana-lifecycle-confirm" role="group" aria-label="Confirm class status">
    <div><strong>{lifecycleConfirm==='paused'?'Pause this class?':'Archive this class?'}</strong>
      <p>{lifecycleConfirm==='paused'?'Upcoming sessions will show as paused. Existing records are retained.':'Future sessions will be hidden from the active calendar. You can restore them later.'}</p></div>
    <div className="sadhana-lifecycle-confirm-actions">
      <button type="button" className="reg-secondary" onClick={()=>setLifecycleConfirm(null)} disabled={lifecycleBusy}>Go back</button>
      <button type="button" className="reg-primary" disabled={lifecycleBusy} onClick={()=>void updateLifecycle(lifecycleConfirm)}>{lifecycleBusy?'Saving…':lifecycleConfirm==='paused'?'Confirm pause':'Confirm archive'}</button>
    </div>
  </div>}
  {lifecycleError&&<p role="alert" className="sadhana-sync-error">{lifecycleError}</p>}
</section>}
{masterDeleteError&&<p className="sadhana-sync-error" role="alert">{masterDeleteError}</p>}
 <div className="reg-modal-actions sadhana-master-footer">
  {!isTeacher&&editingMaster&&<button type="button" className="reg-danger" disabled={masterDeleteBusy} onClick={()=>void reviewMasterDeletion()}><Trash2 size={15}/> Delete master class</button>}
  <div className="sadhana-master-footer-right"><button type="button" className="reg-secondary" onClick={()=>setMaster(null)}>Cancel</button>
  {!isTeacher&&!editingMaster&&<button type="button" className="reg-primary" onClick={()=>setEditingMaster(true)}>Edit class</button>}{!isTeacher&&editingMaster&&<button type="submit" className="reg-primary" disabled={saving}>{saving?'Saving…':baselineLinkOnly?(masterReview?'Confirm teacher link':'Review teacher link'):'Save changes'}</button>}</div>
</div><p className="reg-footnote">If the existing name already matches a registered teacher, Save links its identity to this class baseline. Choose a different teacher plus an effective date to change future sessions. For an existing dated rule, open a session in that period.</p></form>}</section></div>}{master&&masterDeleteReview&&<div className="reg-shade sadhana-master-delete-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!masterDeleteBusy)setMasterDeleteReview(null);}}>
 <section className="reg-modal sadhana-master-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="master-delete-title" aria-describedby="master-delete-message">
 <div className="reg-modal-head"><div><h2 id="master-delete-title">Delete master class?</h2><p>Administrator action · Permanent deletion</p></div><button type="button" className="reg-icon-btn" onClick={()=>setMasterDeleteReview(null)} disabled={masterDeleteBusy} aria-label="Close"><X size={18}/></button></div>
 <div className="sadhana-master-delete-content"><strong>{masterDeleteReview.name}</strong><div className="sadhana-master-delete-summary"><span>Master class</span><strong>1</strong><span>Scheduled sessions</span><strong>{masterDeleteReview.sessionCount}</strong><span>Recurring rules</span><strong>{masterDeleteReview.ruleCount}</strong></div>
 <p id="master-delete-message"><CircleAlert size={17}/> This removes the master class, all its listed dated sessions and recurring rules. It cannot be undone.</p>
 {masterDeleteReview.dates.length>0&&<details><summary>View session dates</summary><div className="sadhana-master-delete-dates">{masterDeleteReview.dates.map((d:string,i:number)=><span key={d+i}>{d}</span>)}</div></details>}
 </div><div className="sadhana-master-delete-buttons"><button type="button" className="reg-secondary" disabled={masterDeleteBusy} onClick={()=>setMasterDeleteReview(null)}>Keep class</button><button type="button" className="reg-danger" disabled={masterDeleteBusy} onClick={()=>void confirmMasterDeletion()}><Trash2 size={15}/>{masterDeleteBusy?'Deleting…':'Delete class & sessions'}</button></div>
 </section></div>}

  </>;
}
