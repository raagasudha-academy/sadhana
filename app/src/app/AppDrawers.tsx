import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, CircleAlert, Info, Music2, X, Link2 } from "lucide-react";
import { institutions } from "../institutions";
import type { InstitutionId } from "../types";
import { ukDate, displayTime, Pill, PageHeader, EmptyState, teacherNameKey } from "./appShared";
import { InfoRow } from "./AppRecords";

export function sadhanaConfirmDialog(message:string):Promise<boolean>{
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='sadhana-confirm-overlay';
  const panel=document.createElement('section');panel.className='sadhana-confirm-panel';
  panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Confirm permanent deletion');
  const header=document.createElement('div');header.className='sadhana-confirm-header';
  const heading=document.createElement('h2');heading.textContent='Delete selected session(s)?';
  const subtitle=document.createElement('p');subtitle.textContent='Administrator action · Permanent deletion';
  header.append(heading,subtitle);
  const detail=document.createElement('p');detail.className='sadhana-confirm-message';detail.textContent=message;
  const actions=document.createElement('div');actions.className='sadhana-confirm-actions';
  const keep=document.createElement('button');keep.type='button';keep.textContent='Keep sessions';keep.className='sadhana-confirm-keep';
  const remove=document.createElement('button');remove.type='button';remove.textContent='Delete sessions';remove.className='sadhana-confirm-delete';
  const finish=(value:boolean)=>{document.removeEventListener('keydown',esc);overlay.remove();resolve(value);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();finish(false);}};
  keep.onclick=()=>finish(false);remove.onclick=()=>finish(true);
  overlay.onclick=e=>{if(e.target===overlay)finish(false)};
  actions.append(keep,remove);panel.append(header,detail,actions);overlay.append(panel);
  document.body.append(overlay);document.addEventListener('keydown',esc);keep.focus();
 });
}

export function SessionDrawer({ session, onClose, onClass, cloud, onSaved, canEdit, canDelete, isTeacher=false }: any) {
 const [editing,setEditing]=useState(false);
 const [scope,setScope]=useState<'one'|'following'>('one');
 const [futureSelection,setFutureSelection]=useState<'all'|'selected'>('all');
 const [effectiveFrom,setEffectiveFrom]=useState(session.dateISO||'');
 const [effectiveUntil,setEffectiveUntil]=useState(session.dateISO||'');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [pendingReview,setPendingReview]=useState<null|'historical'|'dated-link'>(null);
 const [impact,setImpact]=useState<any>(null);
 const [impactKey,setImpactKey]=useState('');
 const [teachers,setTeachers]=useState<Array<{id:string;displayName:string;active:boolean}>>([]);
 const [links,setLinks]=useState<import('../api/sadhanaClient').TeacherLinkRow[]>([]);
 const [pickedTeacherId,setPickedTeacherId]=useState<string|null>(null);
 const [form,setForm]=useState<any>({
   name:session.name,programme:session.original?.programme??session.programme??'',
   teacher:session.original?.teacher??session.teacher??'',
   mode:session.original?.mode??session.mode??'',location:session.original?.location??session.venue??'',
   date:session.original?.date??session.dateISO,endDate:session.original?.endDate??session.dateISO,
   startTime:session.original?.startTime??session.time??'',endTime:session.original?.endTime??session.endTime??'',
   status:session.original?.status??'confirmed',
 });
 useEffect(()=>{
   if(!editing||!cloud||!canEdit||isTeacher||!['sruti','raaga'].includes(session.institution))return;
   let active=true;
   Promise.all([cloud.api.listTeachers(session.institution),cloud.api.listTeacherLinks(session.institution)])
    .then(([directory,assignment])=>{
      if(active){setTeachers(directory.records.filter((t:any)=>t.active));setLinks(assignment.rows);}
    }).catch((e:Error)=>{if(active)setError(`Cannot load registered teachers: ${e.message}`);});
   return()=>{active=false;};
 },[editing,cloud?.api,canEdit,isTeacher,session.institution]);
 // Never silently pin a session to a teacher when only its time/location is edited.
 // Unlinked names stay unselected until the admin explicitly chooses a registry profile.
 const selectedTeacherId=pickedTeacherId??(session.original?.teacherId||'');
 const selectedTeacher=teachers.find(t=>t.id===selectedTeacherId);
 const original=session.original||{};
 const rule=links.filter(r=>r.scope==='series'&&r.classId===session.classId&&r.effectiveFrom<=session.dateISO&&teacherNameKey(r.teacher)===teacherNameKey(form.teacher))
  .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
 const resetImpact=()=>{setImpact(null);setImpactKey('');setBulkReview(null);};
 const update=(key:string,value:string)=>{resetImpact();setPendingReview(null);setForm((d:any)=>({...d,[key]:value,...(key==='date'&&!session.allDay?{endDate:value}:{})}));};
 const deleteOne=async()=>{
  if(!canDelete||!cloud||!session.sadhana)return;
  if(!await sadhanaConfirmDialog(`Permanently delete ${session.name} on ${session.dateISO}? This cannot be undone. Other sessions and the master class remain.`))return;
  setBusy(true);setError('');
  try{await cloud.api.deleteScheduleSession(session.institution,session.recordId,session.expectedVersion);onSaved();}
  catch(e){setError(e instanceof Error?e.message:'Unable to delete session.');}
  finally{setBusy(false);}
 };
 const [bulkReview,setBulkReview]=useState<any>(null);
 const deleteFuture=async()=>{
  if(!cloud||!canDelete||isTeacher||!session.classId)return;
  setBusy(true);setError('');
  try{
   const until=futureSelection==='selected'?effectiveUntil:'9999-12-31';
   if(until<effectiveFrom)throw new Error('End date must not precede start date.');
   if(!bulkReview||bulkReview.from!==effectiveFrom||bulkReview.until!==until){
    const review=await cloud.api.previewDeleteSeries(session.institution,session.classId,effectiveFrom,until,session.seriesMasterVersion);
    setBulkReview(review);return;
   }
   if(!await sadhanaConfirmDialog(`Permanently delete ${bulkReview.count} dated sessions from ${bulkReview.from} to ${bulkReview.until==='9999-12-31'?'the last stored session':bulkReview.until}? This cannot be undone.`))return;
   await cloud.api.deleteSeriesSessions(session.institution,session.classId,effectiveFrom,until,session.seriesMasterVersion,bulkReview.signature);
   setBulkReview(null);onSaved();
  }catch(e){setBulkReview(null);setError(e instanceof Error?e.message:'Unable to delete future sessions.');}
  finally{setBusy(false);}
 };
 const save=async()=>{
   if(!cloud||!session.sadhana||!canEdit)return;
   setBusy(true);setError('');
   try{
     if(isTeacher&&scope==='following')throw new Error('Teachers may edit individual sessions only.');
     if(scope==='following'&&futureSelection==='selected'&&(!effectiveUntil||effectiveUntil<effectiveFrom))throw new Error('Choose an end date on or after the start date.');
     const teacherChanged=form.teacher!==original.teacher;
     const newLink=session.recordType==='class-session'&&!!selectedTeacherId&&selectedTeacherId!==(original.teacherId||'');
     if(scope==='following'){
       if(!session.classId||!Number.isInteger(session.seriesMasterVersion))throw new Error('Master class version unavailable. Refresh the timetable.');
       const changes:Record<string,string>={};
       for(const key of ['name','programme','mode','location','status','startTime','endTime'])if(form[key]!==original[key])changes[key]=form[key];
       if(teacherChanged){
         if(!selectedTeacher||selectedTeacher.displayName!==form.teacher)throw new Error('Choose a registered teacher.');
         changes.teacher=selectedTeacher.displayName;
         changes.teacherId=selectedTeacher.id;
       }
       if(!Object.keys(changes).length&&newLink){
         if(!rule||rule.teacherId)throw new Error('No unlinked dated teacher rule found. Edit the master class to link its baseline.');
         if(!selectedTeacher||teacherNameKey(selectedTeacher.displayName)!==teacherNameKey(rule.teacher))throw new Error('Teacher does not match the existing dated rule.');
         if(pendingReview!=='dated-link'){setPendingReview('dated-link');return;}
         await cloud.api.linkTeacherIdentity(session.institution,session.classId,{teacherId:selectedTeacher.id,expectedVersion:rule.version,effectiveFrom:rule.effectiveFrom});
       }else{
         if(!Object.keys(changes).length)throw new Error('No changes. Choose a different teacher, adjust the time or link an existing assignment.');
         if(newLink&&!teacherChanged&&rule&&!rule.teacherId)throw new Error('First link the existing dated teacher assignment separately; then save time changes.');
         const until=futureSelection==='selected'?effectiveUntil:undefined;
        const key=JSON.stringify({changes,effectiveFrom,until,version:session.seriesMasterVersion});
        if(impactKey!==key){
          const result=await cloud.api.previewScheduleSeries(session.institution,session.classId,changes,effectiveFrom,session.seriesMasterVersion,until);
          setImpact(result);setImpactKey(key);return;
        }
        await cloud.api.updateScheduleSeries(session.institution,session.classId,changes,effectiveFrom,session.seriesMasterVersion,until);
        setImpact(null);setImpactKey('');
       }
     }else{
       const changes:Record<string,unknown>=Object.fromEntries(Object.entries(form).filter(([k,v])=>v!==original[k]));
       if((teacherChanged||newLink)&&session.recordType==='class-session'){
         if(!selectedTeacher||teacherNameKey(selectedTeacher.displayName)!==teacherNameKey(form.teacher))throw new Error('Choose a registered teacher.');
         changes.teacher=selectedTeacher.displayName;
         changes.teacherId=selectedTeacher.id;
       }
       if(!Object.keys(changes).length)throw new Error('No session changes to save.');
       if(session.dateISO<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
         if(pendingReview!=='historical'){setPendingReview('historical');return;}
       }
       await cloud.api.updateSchedule(session.institution,session.recordId,changes,session.expectedVersion);
     }
     onSaved();
   }catch(e){setError(e instanceof Error?e.message:'Could not save this event.');}
   finally{setBusy(false);}
 };
 return <div className="drawer-backdrop" onClick={onClose}><aside className="detail-drawer" onClick={e=>e.stopPropagation()} aria-label="Session quick details">
 <div className="drawer-head"><span>{editing?'EDIT TIMETABLE ENTRY':'SESSION DETAILS'}</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
 <div className={`drawer-cover ${session.institution}`}><CalendarDays size={25}/><h2>{session.name}</h2><Pill tone={session.status==='Cancelled'?'red':'green'}>{session.status}</Pill></div>
 {session.attentionItems?.length>0&&<div className="sadhana-record-issues sadhana-drawer-issues" role="note"><CircleAlert size={18}/><div><strong>Session needs attention</strong><ul>{session.attentionItems.map((issue:string)=><li key={issue}>{issue}</li>)}</ul><small>Based on the saved session. Refresh after fixing to clear this warning.</small></div></div>}
 {editing?<form className="reg-form sadhana-session-editor" onSubmit={e=>{e.preventDefault();void save();}}>
  {session.recordType==='class-session'&&!isTeacher&&<label className="sadhana-edit-field">
   <span>Which sessions should change?</span>
   <select aria-label="Which sessions should change?" value={scope} onChange={e=>{setScope(e.target.value as 'one'|'following');resetImpact();setError('');setPendingReview(null);}}>
     <option value="one">Just this session</option>
     <option value="following">Future sessions</option>
   </select>
  </label>}
  {session.recordType==='class-session'&&scope==='following'&&<fieldset className="sadhana-scope-picker">
    <legend>Apply changes to</legend>
    <div style={{display:'flex',flexWrap:'wrap',gap:'12px 20px',alignItems:'center'}}>
      <label style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="radio" name="sadhana-future-selection" checked={futureSelection==='all'} onChange={()=>{setFutureSelection('all');resetImpact();setError('');setPendingReview(null);}}/>
        <span>All future sessions</span>
      </label>
      <label style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="radio" name="sadhana-future-selection" checked={futureSelection==='selected'} onChange={()=>{setFutureSelection('selected');resetImpact();setError('');setPendingReview(null);}}/>
        <span>Selected dates</span>
      </label>
    </div>
  </fieldset>}
  {scope==='following'&&<label className="sadhana-edit-field"><span>Effective from (UK date)</span><input type="date" required value={effectiveFrom} onChange={e=>{setPendingReview(null);setEffectiveFrom(e.target.value);resetImpact();}}/></label>}
  {scope==='following'&&futureSelection==='selected'&&<label className="sadhana-edit-field">
    <span>Effective until (inclusive)</span>
    <input type="date" required min={effectiveFrom} value={effectiveUntil} onChange={e=>{setPendingReview(null);setEffectiveUntil(e.target.value);resetImpact();}}/>
  </label>}
 {(['name','programme','teacher','mode','location'] as const).map(k=><label key={k} className="sadhana-edit-field"><span>{k==='teacher'?'Registered teacher':k}</span>
 {k==='teacher'&&isTeacher?<input readOnly value={form.teacher||''}/>:k==='teacher'&&session.recordType==='class-session'?<select aria-label="Registered teacher for this assignment" value={selectedTeacherId} onChange={e=>{
    const t=teachers.find(t=>t.id===e.target.value);
    setPendingReview(null);setPickedTeacherId(t?.id||'');update('teacher',t?.displayName||'');
  }}><option value="">{form.teacher?`Unlinked: ${form.teacher}`:'Choose registered teacher'}</option>
  {teachers.map(t=><option key={t.id} value={t.id}>{t.displayName}</option>)}</select>
 :<input maxLength={k==='location'?300:180} value={form[k]||''} onChange={e=>update(k,e.target.value)} />}</label>)}
 {scope==='following'&&rule&&!rule.teacherId&&selectedTeacherId&&teacherNameKey(form.teacher)===teacherNameKey(rule.teacher)&&<p className="reg-footnote"><Link2 size={14}/> Existing teacher rule from {rule.effectiveFrom} is not linked. With no other changes, Save links its registered identity; it does not create a second rule.</p>}
 {scope==='one'&&<label className="sadhana-edit-field"><span>Date</span><input type="date" required value={form.date} onChange={e=>update('date',e.target.value)}/></label>}
 {session.allDay?<label className="sadhana-edit-field"><span>End date (exclusive)</span><input type="date" required value={form.endDate} onChange={e=>update('endDate',e.target.value)}/></label>:<div className="sadhana-edit-time-row"><label className="sadhana-edit-field"><span>Start time</span><input type="time" required value={form.startTime} onChange={e=>update('startTime',e.target.value)} /></label><label className="sadhana-edit-field"><span>End time</span><input type="time" required value={form.endTime} onChange={e=>update('endTime',e.target.value)} /></label></div>}
 <label className="sadhana-edit-field"><span>Status</span><select value={form.status} onChange={e=>update('status',e.target.value)}><option value="confirmed">Confirmed</option><option value="tentative">Tentative</option><option value="cancelled">Cancelled</option></select></label>
 {scope==='one'&&session.dateISO<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())&&<div className="sadhana-inline-note"><Info size={17}/><span>This is a past session. Edits here affect only this date.</span></div>}
 {!isTeacher&&scope==='following'&&<div className="sadhana-inline-note"><Info size={17}/><span>{futureSelection==='all'?`Changes will apply from ${effectiveFrom||'the selected date'} onwards. Earlier sessions are preserved.`:`Changes would apply from ${effectiveFrom||'the selected date'} through ${effectiveUntil||'the end date'}, inclusive. Earlier and later sessions retain their otherwise applicable assignments.`}</span></div>}
 {scope==='following'&&impact&&<div className="sadhana-inline-review" role="status"><Info size={18}/><div><strong>Review affected sessions</strong><p>{impact.changedCount} of {impact.totalSessions} stored sessions would change; {impact.protectedCount} protected by individual overrides. {impact.overlappingRules.length} overlapping later rules found.</p>{impact.protectedSessionIds.length>0&&<p>Protected session IDs: {impact.protectedSessionIds.join(', ')}</p>}{impact.overlappingRules.length>0&&<p>Other rules start: {impact.overlappingRules.map((r:any)=>r.effectiveFrom).join(', ')}. Later rules can supersede this change.</p>}<button type="button" className="sadhana-review-back" onClick={resetImpact}>Back to editing</button></div></div>}
 {pendingReview&&<div className="sadhana-inline-review" role="status" aria-live="polite"><CircleAlert size={19}/><div><strong>Review before saving</strong><p>{pendingReview==='historical'?`Correct only the session on ${session.dateISO}? Other dated sessions and rules will remain unchanged.`:`Link ${selectedTeacher?.displayName||'this teacher'} to the existing rule from ${rule?.effectiveFrom||effectiveFrom}? No sessions will be rewritten.`}</p><button className="sadhana-review-back" type="button" onClick={()=>setPendingReview(null)}>Back to editing</button></div></div>}
 {bulkReview&&scope==='following'&&<div className="sadhana-inline-review" role="status"><CircleAlert size={18}/><div><strong>Review {bulkReview.count} sessions for permanent deletion</strong><p>{bulkReview.dates.map((x:any)=>x.date).join(' · ')}</p><p>Only stored sessions for this master class are selected. The master class and rules remain.</p></div></div>}
 {error&&<p className="sadhana-sync-error" role="alert">{error}</p>}
 <div className="reg-modal-actions" style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'flex-end',gap:10}}>
 <button className="reg-secondary" style={{flex:'0 0 auto',width:'auto',margin:0}} type="button" onClick={()=>{setEditing(false);setPendingReview(null);}}>Cancel</button>
 {canDelete&&session.recordType==='class-session'&&<button style={{flex:'0 0 auto',width:'auto',margin:0}} type="button" className="reg-danger" disabled={busy} onClick={()=>void (!isTeacher&&scope==='following'?deleteFuture():deleteOne())}>{scope==='following'?(bulkReview?'Confirm delete future':'Delete future sessions'):'Delete session'}</button>}
 <button style={{flex:'0 0 auto',width:'auto',margin:0}} className="reg-primary" type="submit" disabled={busy||(scope==='following'&&futureSelection==='selected'&&(!effectiveUntil||effectiveUntil<effectiveFrom))}>{busy?'Saving…':pendingReview==='historical'?'Confirm correction':pendingReview==='dated-link'?'Confirm teacher link':scope==='following'&&impact?'Confirm recurring change':scope==='following'?'Preview future changes':'Save session'}</button></div>
 <p className="reg-footnote">{scope==='following'?(futureSelection==='all'?'Teacher and time changes apply from the chosen date until replaced by a later rule.':'Only sessions within the chosen inclusive date range are affected; outside it the applicable recurring schedule resumes.'):'Other sessions stay unchanged.'}</p>
 </form>:<><div className="drawer-info"><InfoRow name="Date">{ukDate(session.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</InfoRow><InfoRow name="Time">{session.allDay?'All day':`${displayTime(session.time)} – ${displayTime(session.endTime)} UK`}</InfoRow><InfoRow name="Programme">{session.programme||'—'}</InfoRow><InfoRow name="Teacher">{session.teacher}</InfoRow><InfoRow name="Delivery">{session.mode}</InfoRow><InfoRow name="Venue">{session.venue}</InfoRow>{session.venueId&&<InfoRow name="Address">{session.venueAddress}</InfoRow>}</div><div className="drawer-note"><Info size={17}/><span>{session.sadhana?'Stored in Sadhana DynamoDB. Individual sessions can be corrected without changing the rest of the timetable.':'Local-only record. Use the Sadhana-owned timetable for persistent edits.'}</span></div>{session.sadhana&&cloud&&canEdit?<button className="primary-button wide" onClick={()=>setEditing(true)}>Edit this session <ArrowRight size={16}/></button>:!session.source&&<button className="primary-button wide" onClick={()=>onClass(session)}>Open class profile <ArrowRight size={16}/></button>}</>}
 </aside></div>;
}
export function NotificationDrawer({ notifications, allowed, filter, setFilter, onSelect, onClose }: any) {
  const visible=notifications.filter(n=>allowed.includes(n.institution)).filter(n=>filter==='all'||n.institution===filter);
  const unread=visible.reduce((total,n)=>total+(n.read?0:Math.max(1,Number(n.unreadCount)||0)),0);
  return <div className="drawer-backdrop" onClick={onClose}><aside className="detail-drawer notification-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><span>NOTIFICATION CENTRE</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="notification-heading"><h2>Notifications</h2><span>{unread} unread</span></div><div className="notification-filters"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All</button>{allowed.map(k=><button className={filter===k?'active':''} key={k} onClick={()=>setFilter(k)}>{institutions[k].name}</button>)}</div><div className="notification-list">{visible.map(n=><button key={n.id} className={`notification-item ${n.read?'':'unread'}`} onClick={()=>void onSelect(n)}><div className="notification-status">{!n.read&&<i/>}</div><div><div className="notification-title"><strong>{n.title}</strong><Pill tone={n.institution==='raaga'?'orange':'violet'}>{institutions[n.institution].name}</Pill></div><p>{n.detail}</p><span>{n.age} · {n.category}</span></div></button>)}{!visible.length&&<EmptyState title="No notifications" detail="There is no message activity for this filter."/>}</div><div className="drawer-note"><Info size={17}/><span>Recent message activity from your authorised academies.</span></div></aside></div>;
}
/** Management records belong to one academy; the combined view never makes cross-academy writes. */
export function AcademySelection({page,allowed,onSelect}: {
  page:string;allowed:InstitutionId[];onSelect:(institution:InstitutionId)=>void
}) {
  return <>
    <PageHeader kicker="ALL INSTITUTIONS" title={page} description="Choose an academy to manage its records. The combined workspace keeps the shared overview, timetable and venues available."/>
    <div className="institution-cards">{allowed.map(key=>{
      const inst=institutions[key];
      return <section className="surface institution-summary" key={key}>
        <div className="institution-label"><span className={`institution-symbol ${key}`}>{key==='raaga'?<Music2 size={19}/>:<BookOpen size={19}/>}</span><div><h2>{inst.name}</h2><p>{inst.descriptor}</p></div></div>
        <p>Open {page.toLowerCase()} for {inst.name}.</p>
        <div className="institution-actions"><button className="text-button" type="button" onClick={()=>onSelect(key)}>Continue to {inst.name} <ArrowRight size={14}/></button></div>
      </section>;
    })}</div>
  </>;
}

export function StaffPortrait({name,initial,photoUrl=''}:{name:string;initial:string;photoUrl?:string}) {
  const local=name.toLowerCase().replace(/[^a-z]/g,'').replace(/^(mrs|miss|prof|mr|ms|dr)/,'')==='mohanakamanooru'
    ?`${import.meta.env.BASE_URL}teachers/mohana-kamanooru.png`:'';
  const [source,setSource]=useState(photoUrl||local);
  useEffect(()=>setSource(photoUrl||local),[photoUrl,local]);
  return source?<img src={source} alt="" onError={()=>setSource(source===photoUrl?local:'')}/>:<>{initial}</>;
}

