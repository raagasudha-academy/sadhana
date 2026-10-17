import { useMemo,useState } from 'react';
import {Activity,ArrowLeft,CheckCircle2,Clock3,Download,Edit3,FileBarChart2,Plus,Trash2,X} from 'lucide-react';
import {institutions} from './institutions';
import {newId,ukISODate} from './registry';
import {aggregate,between,lastFourWeeks,reportForStudent,enrolOnDate,studentClassIds} from './practiceMath';
const escapeCSV = s => '"'+String(s??'').replace(/"/g,'""')+'"';
const formatRate=r=>r==null?'No data':`${r}%`;
function Dialog({title,onClose,children}: any){return <div className="reg-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="reg-modal" role="dialog" aria-modal="true" aria-label={title}><div className="reg-modal-head"><h2>{title}</h2><button className="reg-icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></div>{children}</section></div>;}
function PracticeDialog({workspace,record,members,enrolments,classes,onSave,onClose}: any){
  const [studentId,setStudentId]=useState(record?.studentId || '');
  const [date,setDate]=useState(record?.date || ukISODate());
  const [did,setDid]=useState(record?.didPractice===false?'No':'Yes');
  const [minutes,setMinutes]=useState(String(record?.minutes || 20));
  const [comments,setComments]=useState(record?.comments || '');
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const studentIds=new Set(enrolments.filter(e=>e.institution===workspace).map(e=>e.studentId));
  const options=members.filter(m=>studentIds.has(m.id));
  const enrols=enrolments.filter(e=>e.studentId===studentId&&e.institution===workspace);
  const validEnrol=enrols.some(e=>enrolOnDate(e,date)&&classes.some(c=>c.id===e.classId&&date>=(c.startDate||'0001-01-01')&&(!c.endDate||date<=c.endDate)));
  const submit=e=>{e.preventDefault();setError('');if(!studentId||!date||date>ukISODate())return setError('Select a student and a valid past or current UK date.');if(!validEnrol)return setError('The selected student was not enrolled in a scheduled class on that date.');if(did==='Yes'&&(!Number.isInteger(Number(minutes))||Number(minutes)<=0||Number(minutes)>1440))return setError('Enter a practice duration between 1 and 1440 minutes.');if(!reason.trim())return setError('A reason for this administrator action is required.');onSave({studentId,date,institution:workspace,didPractice:did==='Yes',minutes:did==='Yes'?Number(minutes):0,comments:comments.trim(),reason:reason.trim()},record?.id);};
  return <Dialog title={record?'Correct practice record':'Record practice (administrator)'} onClose={onClose}><form className="reg-form" onSubmit={submit}>
    <label className="reg-field"><span>Student *</span><select required disabled={!!record} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Choose student</option>{options.map(m=><option value={m.id} key={m.id}>{m.name} · {m.id}</option>)}</select></label>
    <div className="reg-form-grid"><label className="reg-field"><span>Practice date (UK) *</span><input type="date" required max={ukISODate()} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="reg-field"><span>Practised? *</span><select value={did} onChange={e=>setDid(e.target.value)}><option>Yes</option><option>No</option></select></label></div>
    {did==='Yes'&&<label className="reg-field"><span>Minutes *</span><input required type="number" min={1} max={1440} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>}
    <label className="reg-field"><span>Practice comments (optional)</span><textarea rows={2} value={comments} onChange={e=>setComments(e.target.value)} maxLength={300} placeholder="Practice details or reason for not practising"/></label>
    <label className="reg-field"><span>Reason for {record?'correction':'backdated / administrator entry'} *</span><textarea required rows={2} value={reason} onChange={e=>setReason(e.target.value)} maxLength={250} placeholder="e.g. Parent requested correction of duration"/></label>
    <div className="reg-info">This creates a browser-only entry that will disappear on refresh. No WhatsApp messages are sent. Practice Rate is based on Yes/No responses; Submission Rate counts eligible expected days.</div>
    {error&&<p className="reg-error" role="alert">{error}</p>}<div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button className="reg-primary" type="submit">{record?'Save correction':'Save practice entry'}</button></div>
  </form></Dialog>;
}
function VoidDialog({record,onClose,onVoid}: any){
  const [reason,setReason]=useState('');
  return <Dialog title="Void incorrect practice entry" onClose={onClose}><div className="reg-form"><p>This will exclude the entry from calculations without erasing its audit history.</p><p><strong>{record.studentId} · {record.date}</strong></p><label className="reg-field"><span>Reason for voiding *</span><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} required/></label><div className="reg-modal-actions"><button className="reg-secondary" onClick={onClose}>Cancel</button><button className="reg-danger" disabled={!reason.trim()} onClick={()=>onVoid(record.id,reason.trim())}><Trash2 size={16}/> Void entry</button></div></div></Dialog>;
}
export default function PracticeModule({workspace,teacherMode,members,enrolments,classes,logs,setLogs}: any){
  const [period,setPeriod]=useState('four');const [dates,setDates]=useState(lastFourWeeks());const [classFilter,setClassFilter]=useState('all');const [studentFilter,setStudentFilter]=useState('all');const [dialog,setDialog]=useState(null);const [notice,setNotice]=useState('');const [showAudit,setShowAudit]=useState(false);
  const classRows=classes.filter(c=>c.institution===workspace&&!c.archived);
  const allowedClasses=teacherMode?classRows.filter(c=>false):classRows;
  const classIds=new Set(allowedClasses.map(c=>c.id));
  const involved=new Set(enrolments.filter(e=>e.institution===workspace&&classIds.has(e.classId)).map(e=>e.studentId));
  const reportRows=members.filter(m=>involved.has(m.id)&&(!m.archived)).filter(m=>classFilter==='all'||studentClassIds(m.id,workspace,enrolments).has(classFilter)).map(m=>({id:m.id,name:m.name,...reportForStudent(m.id,workspace,dates.from,dates.to,enrolments,classes,logs)}));
  const summary=aggregate(reportRows);
  const selectedLogs=logs.filter(l=>l.institution===workspace&&involved.has(l.studentId)&&between(l.date,dates.from,dates.to)&&(studentFilter==='all'||l.studentId===studentFilter)).sort((a,b)=>b.date.localeCompare(a.date));
  const students=members.filter(m=>involved.has(m.id));
  const save=(input,id)=>{
    const other=logs.find(l=>l.studentId===input.studentId&&l.institution===workspace&&l.date===input.date&&l.status!=='Voided'&&l.id!==id);
    if(other){setNotice('An active entry already exists for this student, institution and date. Correct that entry instead.');return;}
    if(id){setLogs(prev=>prev.map(l=>l.id===id?{...l,...input,source:'Administrator Corrected',history:[...(l.history||[]),{action:'Correction',at:new Date().toISOString(),previous:{date:l.date,minutes:l.minutes,didPractice:l.didPractice,comments:l.comments},reason:input.reason}]}:l));setNotice('Practice record corrected. Reports recalculated.');}
    else{setLogs(prev=>[...prev,{...input,id:newId('P',prev),source:'Administrator Recorded',status:'Active',history:[{action:'Created',at:new Date().toISOString(),reason:input.reason}]}]);setNotice('Practice record added. Reports recalculated.');}
    setDialog(null);
  };
  const voidEntry=(id,reason)=>{setLogs(prev=>prev.map(l=>l.id===id?{...l,status:'Voided',history:[...(l.history||[]),{action:'Voided',at:new Date().toISOString(),reason}]}:l));setDialog(null);setNotice('Entry voided and excluded from rates and minutes.');};
  const exportCSV=()=>{
    const header=['Student ID','Student','Expected days','Submitted days','Practised days','Missing days','Minutes','Practice Rate %','Submission Rate %'];
    const csv=[header,...reportRows.map(r=>[r.id,r.name,r.expected,r.submitted,r.practised,r.missing,r.minutes,r.practiceRate??'No data',r.submissionRate??'No data'])].map(row=>row.map(escapeCSV).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`sadhana-${workspace}-practice-${dates.from}-${dates.to}.csv`;a.click();URL.revokeObjectURL(url);
    setNotice('Excel-compatible CSV downloaded. Native XLSX/PDF export will follow with the backend.');
  };
  const periodChange=v=>{setPeriod(v);if(v==='four')setDates(lastFourWeeks());else if(v==='week')setDates({from:lastFourWeeks().to?(()=>{const d=ukISODate();const weekday=new Date(`${d}T12:00:00Z`).getUTCDay();return shiftLocal(d,-((weekday+6)%7));})():'',to:ukISODate()});};
  const shiftLocal=(date,num)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+num);return d.toISOString().slice(0,10);};
  return <div className="practice-module">
    <div className="page-heading"><div><div className="eyebrow">PRACTICE LOGGING & REPORTS</div><h1>{institutions[workspace].name} practice</h1><p>Log, correct and review practice records. Dates and calculations use UK time.</p></div>{!teacherMode&&<div className="heading-actions"><button className="reg-primary" onClick={()=>setDialog({type:'add'})}><Plus size={17}/> Record practice</button></div>}</div>
    {notice&&<div className="reg-success" role="status"><CheckCircle2 size={16}/><span>{notice}</span><button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <section className="surface reg-section"><div className="reg-filter-line"><label>Period <select value={period} onChange={e=>periodChange(e.target.value)}><option value="four">Last four weeks</option><option value="week">This week</option><option value="custom">Custom</option></select></label><label>From <input type="date" value={dates.from} max={dates.to} onChange={e=>{setPeriod('custom');setDates(d=>({...d,from:e.target.value}));}}/></label><label>To <input type="date" value={dates.to} min={dates.from} max={ukISODate()} onChange={e=>{setPeriod('custom');setDates(d=>({...d,to:e.target.value}));}}/></label><label>Class <select value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="all">All classes</option>{allowedClasses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    <div className="stat-grid mini-grid"><div className="metric-card"><small>Practice Rate</small><h2>{formatRate(summary.practiceRate)}</h2><small>Yes / submitted expected days</small></div><div className="metric-card"><small>Submission Rate</small><h2>{formatRate(summary.submissionRate)}</h2><small>Submitted / expected days</small></div><div className="metric-card"><small>Practice minutes</small><h2>{summary.minutes}</h2><small>Includes voluntary practice</small></div><div className="metric-card"><small>Missing submissions</small><h2>{summary.missing}</h2><small>Expected days without a reply</small></div></div>
    <div className="reg-section-head"><h2>Student performance</h2><div className="reg-actions"><button className="reg-secondary" onClick={exportCSV}><Download size={16}/> Export CSV</button><button className="reg-secondary" onClick={()=>window.print()}>Print / Save PDF</button></div></div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Expected</th><th>Submitted</th><th>Practised</th><th>Missing</th><th>Minutes</th><th>Practice</th><th>Submission</th></tr></thead><tbody>{reportRows.map(r=><tr key={r.id}><td><strong>{r.name}</strong><small className="reg-muted"> {r.id}</small></td><td>{r.expected}</td><td>{r.submitted}</td><td>{r.practised}</td><td>{r.missing}</td><td>{r.minutes}</td><td>{formatRate(r.practiceRate)}</td><td>{formatRate(r.submissionRate)}</td></tr>)}{!reportRows.length&&<tr><td colSpan={8}>No students are enrolled in the selected class or institution.</td></tr>}</tbody></table></div>
    </section>
    <section className="surface reg-section"><div className="reg-section-head"><div><h2>Practice log</h2><p className="reg-muted">One active entry per student, institution and UK date.</p></div><label>Student <select value={studentFilter} onChange={e=>setStudentFilter(e.target.value)}><option value="all">All students</option>{students.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label></div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Student</th><th>Practised</th><th>Minutes</th><th>Comments</th><th>Source / status</th><th>Actions</th></tr></thead><tbody>{selectedLogs.map(l=><tr key={l.id}><td>{l.date}</td><td>{members.find(m=>m.id===l.studentId)?.name||l.studentId}</td><td>{l.didPractice?'Yes':'No'}</td><td>{l.minutes}</td><td>{l.comments||'—'}</td><td>{l.source}<br/><small>{l.status}</small></td><td>{!teacherMode&&l.status!=='Voided'&&<div className="reg-actions"><button className="reg-secondary" onClick={()=>setDialog({type:'edit',record:l})}><Edit3 size={15}/> Correct</button><button className="reg-danger" onClick={()=>setDialog({type:'void',record:l})}><Trash2 size={15}/> Void</button></div>}</td></tr>)}{!selectedLogs.length&&<tr><td colSpan={7}>No practice records in this period.</td></tr>}</tbody></table></div>
    <button className="reg-secondary" onClick={()=>setShowAudit(v=>!v)}>{showAudit?'Hide audit details':'Show audit details'}</button>{showAudit&&<div className="reg-stack">{selectedLogs.filter(l=>l.history?.length).map(l=><div key={l.id} className="reg-note"><strong>{l.id} · {l.studentId} · {l.date}</strong>{l.history.map((h,i)=><p key={i}>{h.action} · {h.at} · {h.reason}{h.previous?` · Previous: ${h.previous.minutes} min / ${h.previous.didPractice?'Yes':'No'}`:''}</p>)}</div>)}</div>}
    </section>
    <div className="info-inline">No practice history has been imported. These forms are not connected to DynamoDB; any entries you add are temporary. Do not enter real student information until persistence, consent and audit safeguards are in place.</div>
    {dialog?.type==='add'&&<PracticeDialog workspace={workspace} members={members} enrolments={enrolments} classes={classes} onSave={save} onClose={()=>setDialog(null)}/>}
    {dialog?.type==='edit'&&<PracticeDialog workspace={workspace} record={dialog.record} members={members} enrolments={enrolments} classes={classes} onSave={save} onClose={()=>setDialog(null)}/>}
    {dialog?.type==='void'&&<VoidDialog record={dialog.record} onClose={()=>setDialog(null)} onVoid={voidEntry}/>}
  </div>;
}
