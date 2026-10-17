import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, CircleAlert, MapPin, Plus, X } from 'lucide-react';
import { institutions } from './institutions';
import { newId, ukISODate } from './registry';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
function Dialog({title, subtitle, onClose, children}: any) {
  return <div className="reg-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="reg-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="reg-modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="reg-icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
      {children}
    </section>
  </div>;
}
function Field({label,hint,children}: any) {return <label className="reg-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
function overlap(a,b) {
  const m = t => Number(t.split(':')[0])*60+Number(t.split(':')[1]);
  return a.day===b.day && m(a.time)<m(b.time)+Number(b.duration) && m(b.time)<m(a.time)+Number(a.duration);
}
export function ClassFormDialog({ workspace, record, classes, venues, onSave, onClose }: any) {
  const [name,setName]=useState(record?.name || '');
  const [teacher,setTeacher]=useState(record?.teacher || '');
  const [day,setDay]=useState(String(record?.day ?? 6));
  const [time,setTime]=useState(record?.time || '10:00');
  const [duration,setDuration]=useState(String(record?.duration ?? 60));
  const [mode,setMode]=useState(record?.mode || 'In Person');
  const [venue,setVenue]=useState(record?.mode==='Online'?'':record?.venue==='Online class'?'':record?.venue || '');
  const [startDate,setStartDate]=useState(record?.startDate || ukISODate());
  const [endDate,setEndDate]=useState(record?.endDate || '');
  const [error,setError]=useState('');
  const [review,setReview]=useState(false);
  const draft={name:clean(name),teacher:clean(teacher),day:Number(day),time,duration:Number(duration),mode,venue:mode==='Online'?'Online class':venue,startDate,endDate};
  const assigned=venues.find(v=>v.name===venue);
  const conflictList=classes.filter(c=>c.id!==record?.id && overlap(draft,c) && (
    (clean(c.teacher).toLowerCase()===clean(teacher).toLowerCase() && clean(teacher)) ||
    (mode==='In Person'&&c.mode==='In Person'&&c.venue===venue&&venue)
  ));
  const beginReview=e=>{
    e.preventDefault();setError('');
    if(!draft.name||!draft.teacher||!draft.time||!Number.isInteger(draft.duration)||draft.duration<15||draft.duration>360) return setError('Enter a class name, teacher, start time and duration between 15 and 360 minutes.');
    if(!draft.startDate || (draft.endDate && draft.endDate < draft.startDate)) return setError('Enter a start date, and an end date on or after the start date.');
    if(mode==='In Person'&&!assigned) return setError('Choose a venue from the directory before continuing.');
    if(classes.some(c=>c.id!==record?.id&&c.institution===workspace&&c.name.toLowerCase()===draft.name.toLowerCase())) return setError('A class with this name already exists in this institution.');
    setReview(true);
  };
  return <Dialog title={record?'Edit class':'Create a class'} subtitle={`${institutions[workspace].name} · Weekly schedule · all times in UK time`} onClose={onClose}>
    <form className="reg-form" onSubmit={review?e=>{e.preventDefault();onSave(draft,record?.id);}:beginReview}>
      {!review?<>
        <Field label="Class name *"><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Carnatic Beginners"/></Field>
        <Field label="Assigned teacher *" hint="One regular teacher per class. Temporary form only; a staff-account link will be required before records are saved to AWS."><input required maxLength={90} value={teacher} onChange={e=>setTeacher(e.target.value)} placeholder="Assigned teacher name"/></Field>
        <div className="reg-form-grid"><Field label="Weekly day"><select value={day} onChange={e=>setDay(e.target.value)}>{DAYS.map((d,i)=><option value={i} key={d}>{d}</option>)}</select></Field><Field label="Start time (UK)"><input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></Field></div>
        <div className="reg-form-grid"><Field label="Duration (minutes)"><input required type="number" min={15} max={360} step={5} value={duration} onChange={e=>setDuration(e.target.value)}/></Field><Field label="Delivery mode"><select value={mode} onChange={e=>setMode(e.target.value)}><option>In Person</option><option>Online</option></select></Field></div>
        <div className="reg-form-grid"><Field label="Class start date *"><input required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field><Field label="Class end date (optional)"><input type="date" min={startDate} value={endDate} onChange={e=>setEndDate(e.target.value)}/></Field></div>
        {mode==='In Person'?<Field label="Teaching venue *" hint="Venues are maintained in the central directory."><select required value={venue} onChange={e=>setVenue(e.target.value)}><option value="">Select venue</option>{venues.map(v=><option value={v.name} key={v.id}>{v.name}</option>)}</select></Field>:<div className="reg-info"><CalendarDays size={16}/><span>Online meeting links are managed externally and are not stored in Sadhana.</span></div>}
        {error&&<p className="reg-error" role="alert">{error}</p>}
      </>:<div className="reg-review"><h3>Review {record?'class changes':'new class'}</h3><div><span>Institution</span><strong>{institutions[workspace].name}</strong></div><div><span>Class</span><strong>{draft.name}</strong></div><div><span>Teacher</span><strong>{draft.teacher}</strong></div><div><span>Runs from / to</span><strong>{draft.startDate} → {draft.endDate || 'Ongoing'}</strong></div><div><span>Timetable</span><strong>{DAYS[draft.day]}, {draft.time} UK · {draft.duration} min</strong></div><div><span>Mode</span><strong>{draft.mode}</strong></div><div><span>Venue</span><strong>{draft.venue}</strong></div>{conflictList.length>0&&<div className="reg-warning"><CircleAlert size={17}/><span>Scheduling overlap detected: {conflictList.map(c=>c.institution===workspace?c.name:'a class in the other institution').join(', ')}. You can proceed after review.</span></div>}{record&&<div className="reg-info"><CircleAlert size={16}/><span>Permanent timetable changes require effective-date history in the live build. Local-only changes are temporary and not saved to DynamoDB.</span></div>}</div>}
      <div className="reg-modal-actions"><button className="reg-secondary" type="button" onClick={review?()=>setReview(false):onClose}>{review?'Back':'Cancel'}</button><button className="reg-primary" type="submit">{review?record?'Confirm class changes':'Create class':'Review class'}</button></div>
    </form>
  </Dialog>;
}
export function VenueFormDialog({record,venues,onSave,onClose}: any){
  const [name,setName]=useState(record?.name||'');
  const [location,setLocation]=useState(record?.location||'');
  const [address,setAddress]=useState(record?.address||'');
  const [postcode,setPostcode]=useState(record?.postcode||'');
  const [notes,setNotes]=useState(record?.notes||'');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setError('');
    const draft={name:clean(name),location:clean(location),address:clean(address),postcode:clean(postcode).toUpperCase(),notes:notes.trim()};
    if(!draft.name||!draft.location||!draft.address)return setError('Enter the venue name, town and full address.');
    if(venues.some(v=>v.id!==record?.id&&v.name.toLowerCase()===draft.name.toLowerCase()))return setError('This venue name is already in the directory.');
    setSaving(true);
    try{await onSave(draft,record?.id);}catch(err){setError(err instanceof Error?err.message:'Unable to save venue.');}
    finally{setSaving(false);}
  };
  return <Dialog title={record?'Edit venue':'Add a venue'} subtitle="Saved in DynamoDB. The change appears in linked classes automatically." onClose={saving?()=>{}:onClose}>
    <form className="reg-form" onSubmit={e=>void submit(e)}>
      <Field label="Venue name *"><input required disabled={saving} value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="e.g. Community Hall"/></Field>
      <Field label="Town or city *"><input required disabled={saving} value={location} onChange={e=>setLocation(e.target.value)} maxLength={100} placeholder="e.g. Durham"/></Field>
      <Field label="Street address *"><input required disabled={saving} value={address} onChange={e=>setAddress(e.target.value)} maxLength={240} placeholder="Full address (include postcode if already stored there)"/></Field>
      <Field label="Postcode (optional separate field)"><input disabled={saving} value={postcode} onChange={e=>setPostcode(e.target.value)} maxLength={20} placeholder="e.g. DH1 5BL"/></Field>
      <Field label="Venue notes (optional)"><textarea disabled={saving} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} rows={3} placeholder="Entrance, parking, accessibility or other venue details"/></Field>
      <div className="reg-info"><MapPin size={16}/><span>Linked calendar sessions keep their dates, teachers and original records. Renaming or correcting this venue changes its displayed details, not the sessions.</span></div>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="reg-primary" type="submit" disabled={saving}>{saving?'Saving…':record?'Save to DynamoDB':'Add to DynamoDB'}</button></div>
    </form>
  </Dialog>;
}
export function VenueManager({venues,onAdd,onEdit,canEdit=false,linkedCounts={},error=''}: any) {
  const rows=useMemo(()=>venues.map(v=>({...v,linked:linkedCounts[v.id]||{masters:0,sessions:0}})),[venues,linkedCounts]);
  return <>
    <div className="page-heading"><div><div className="eyebrow">CENTRAL VENUE DIRECTORY</div><h1>Teaching venues</h1><p>Shared venue details for Raagasudha and Sruti. Changes are saved to DynamoDB.</p></div><div className="heading-actions">{canEdit&&<button className="reg-primary" onClick={onAdd}><Plus size={17}/> Add venue</button>}</div></div>
    <section className="surface reg-section"><div className="reg-section-head"><h2>Venue directory</h2><span className="reg-count">{rows.length} venues</span></div>
      {error&&<p className="reg-error" role="alert">Could not load venues: {error}</p>}
      <div className="venue-manage-grid">{rows.map(v=><article className="venue-manage-card" key={v.id}>
        <div className="venue-manage-head"><MapPin size={19}/><strong>{v.name}</strong></div>
        <p>{v.address}</p>
        {v.postcode&&!String(v.address).toUpperCase().includes(String(v.postcode).toUpperCase())&&<p>{v.postcode}</p>}
        <small>{v.location} · {v.linked.masters} master class{v.linked.masters===1?'':'es'} · {v.linked.sessions} dated session{v.linked.sessions===1?'':'s'}</small>
        {v.notes&&<p>{v.notes}</p>}
        {canEdit&&<div className="reg-actions"><button className="reg-secondary" onClick={()=>onEdit(v)}>Edit venue</button></div>}
      </article>)}</div>
      {!rows.length&&!error&&<div className="reg-empty"><MapPin size={27}/><strong>No venues loaded</strong><p>Check the DynamoDB directory and venue-linking migration.</p></div>}
      <p className="reg-footnote"><CheckCircle2 size={15}/> Changes to shared venues update calendar display automatically. Calendar records are not rewritten. {canEdit?'Raagasudha, Sruti and Sadhana Super Admins can edit venues.':'An authorised administrator account is required to edit venues.'} Physical deletion is disabled.</p>
    </section>
  </>;
}
