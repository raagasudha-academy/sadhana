import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronRight,
  CircleAlert, GraduationCap, Info, Plus, Search, ShieldCheck,
  UsersRound, X, Trash2, Pencil, Archive, RotateCcw, CalendarDays,
} from 'lucide-react';
import { institutions } from './institutions';
import { getEnrolmentStatus, maskPhone, newId, ukISODate } from './registry';
import PhoneField from './PhoneField';
import {lastFourWeeks,reportForStudent} from './practiceMath';

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
function Status({ status }: any) {
  return <span className={`reg-status reg-${status.toLowerCase()}`}>{status}</span>;
}
function Modal({ title, subtitle, onClose, children }: any) {
  return <div className="reg-shade" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="reg-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="reg-modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="reg-icon-btn" aria-label="Close" onClick={onClose}><X size={19}/></button></div>
      {children}
    </section>
  </div>;
}
function Field({ label, hint, children }: any) {
  return <label className="reg-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function StudentAvatar({ name }: any) { return <span className="reg-avatar">{clean(name).split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</span>; }
function NoResults({title,detail}: any) { return <div className="reg-empty"><UsersRound size={29}/><strong>{title}</strong><p>{detail}</p></div>; }
const fmtDate = value => value ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)) : '—';

function RegisterFamily({ onSave, onClose }: any) {
  const [parentName,setParentName] = useState('');
  const [phone,setPhone] = useState('');
  const [studentName,setStudentName] = useState('');
  const [studentPhone,setStudentPhone] = useState('');
  const [error,setError] = useState('');
  const submit = e => {
    e.preventDefault();
    if(!clean(parentName) || !clean(studentName)) return setError('Enter the parent and student names.');
    if(!/^\+[1-9]\d{7,14}$/.test(phone.replace(/[\s-]/g,''))) return setError('Enter an international WhatsApp number such as +447700900123.');
    const ownPhone=studentPhone.replace(/[\s-]/g,'');
    if(ownPhone && !/^\+[1-9]\d{7,14}$/.test(ownPhone)) return setError('Enter a valid student number beginning with +, or leave it blank.');
    onSave({parentName: clean(parentName), phone: phone.replace(/[\s-]/g,''), studentName: clean(studentName), studentPhone:ownPhone});
  };
  return <Modal title="Register a family" subtitle="Create a shared Family ID and Student ID. No WhatsApp messages are activated." onClose={onClose}>
    <form onSubmit={submit} className="reg-form">
      <div className="reg-form-section">Parent / guardian</div>
      <div className="reg-form-grid"><Field label="Parent / guardian name *"><input autoFocus required maxLength={90} value={parentName} onChange={e=>setParentName(e.target.value)} placeholder="Parent or guardian name"/></Field><PhoneField label="Parent / guardian WhatsApp" value={phone} onChange={setPhone}/></div>
      <div className="reg-form-section">First student</div>
      <Field label="Student full name *"><input required maxLength={90} value={studentName} onChange={e=>setStudentName(e.target.value)} placeholder="Student full name"/></Field>
      <PhoneField label="Student WhatsApp" value={studentPhone} onChange={setStudentPhone} optional hint="Leave blank if the child uses the parent's registered number."/>
      <div className="reg-info"><ShieldCheck size={17}/><span>Registration does not activate consent, the Reminder Service, or messaging. Those belong to a later secure phase.</span></div>
      {error && <p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary"><Plus size={16}/> Create family & student</button></div>
    </form>
  </Modal>;
}
function RegisterIndependent({ onSave, onClose }: any) {
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [adult,setAdult]=useState(false);
  const [error,setError]=useState('');
  const submit=e=>{
    e.preventDefault();
    const normalized=phone.replace(/[\s-]/g,'');
    if(!clean(name)) return setError('Enter the student name.');
    if(!/^\+[1-9]\d{7,14}$/.test(normalized)) return setError('Enter a valid student WhatsApp number with an international country code.');
    if(!adult) return setError('Independent registration is available to adults aged 18 or older.');
    onSave({name:clean(name),phone:normalized});
  };
  return <Modal title="Register an independent student" subtitle="For adult learners with their own contact details and no family record." onClose={onClose}>
    <form className="reg-form" onSubmit={submit}>
      <Field label="Student full name *"><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)} placeholder="Adult learner name"/></Field>
      <PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} hint="Independent adults use their own contact number."/>
      <label className="reg-checkbox"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/><span>I confirm that this learner is 18 or older.</span></label>
      <div className="reg-info"><ShieldCheck size={17}/><span>An independent student receives a Student ID but no Family ID. Messaging is not enabled by registration.</span></div>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary"><Plus size={16}/> Register student</button></div>
    </form>
  </Modal>;
}
function AddChild({ family, onSave, onClose }: any) {
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [error,setError]=useState('');
  return <Modal title="Add another student" subtitle={`Add a student to ${family.id}, without duplicating family contacts.`} onClose={onClose}><form className="reg-form" onSubmit={e=>{e.preventDefault();if(!clean(name))return;const normalized=phone.replace(/[\s-]/g,'');if(normalized && !/^\+[1-9]\d{7,14}$/.test(normalized))return setError('Enter a valid international phone number or leave it blank.');onSave({name:clean(name),phone:normalized});}}><Field label="Student full name *"><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></Field><PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} optional/>{error&&<p className="reg-error" role="alert">{error}</p>}<div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary"><Plus size={16}/> Add student</button></div></form></Modal>;
}
function EnrolModal({ workspace, members, families, enrolments, classes: classRecords, presetStudent, presetClass, onClose, onSave }: any) {
  const [studentId,setStudentId] = useState(presetStudent || '');
  const [classId,setClassId] = useState(presetClass || '');
  const [startDate,setStartDate] = useState(ukISODate());
  const [confirmed,setConfirmed] = useState(false);
  const [error,setError] = useState('');
  const classes = classRecords.filter(c=>c.institution===workspace);
  const person=members.find(m=>m.id===studentId);
  const selectedClass=classes.find(c=>c.id===classId);
  const fam=families.find(f=>f.id===person?.familyId);
  const duplicate = enrolments.some(e=>e.studentId===studentId && e.classId===classId && getEnrolmentStatus(e)!=='Archived');
  const overlap = enrolments.filter(e=>e.studentId===studentId && e.institution===workspace && getEnrolmentStatus(e)!=='Archived' && e.classId!==classId)
    .map(e=>classRecords.find(c=>c.id===e.classId))
    .filter(c=>c && selectedClass && c.day===selectedClass.day && (()=>{const start = x => Number(x.time.split(':')[0])*60+Number(x.time.split(':')[1]); return start(c) < start(selectedClass)+selectedClass.duration && start(selectedClass) < start(c)+c.duration;})());
  const check = e=>{e.preventDefault();setError('');if(!studentId || !classId || !startDate) return setError('Choose a student, class and start date.');if(duplicate)return setError('This student already has an active or upcoming enrolment in that class.');setConfirmed(true);};
  return <Modal title="Enrol an existing student" subtitle={`Add an enrolment to ${institutions[workspace].name}; shared Student IDs are preserved.`} onClose={onClose}>
    <form className="reg-form" onSubmit={confirmed ? e=>{e.preventDefault();onSave({studentId,classId,startDate});} : check}>
      {!confirmed ? <>
        <Field label="Select student *"><select required value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Choose from shared family directory</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></Field>
        <Field label="Class *"><select required value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}</select></Field>
        <Field label="Enrolment start date *"><input type="date" required value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>
        {person && <div className="reg-info"><Info size={17}/><span>Student match: {person.name} ({person.id}), {fam?.id || "Independent learner"}. Only shared identity information is shown across academies.</span></div>}
        {duplicate && <p className="reg-error" role="alert">Already enrolled or due to join this class.</p>}
        {overlap.length>0 && <div className="reg-warning"><CircleAlert size={17}/><span>Possible overlapping class: {overlap.map(c=>c.name).join(', ')}. You may review and proceed.</span></div>}
        {error && <p className="reg-error" role="alert">{error}</p>}
      </> : <div className="reg-review"><h3>Review enrolment</h3><div><span>Student</span><strong>{person?.name} ({person?.id})</strong></div><div><span>Institution</span><strong>{institutions[workspace].name}</strong></div><div><span>Class</span><strong>{selectedClass?.name}</strong></div><div><span>Starts</span><strong>{fmtDate(startDate)}</strong></div><div><span>Status</span><Status status={startDate>ukISODate()?'Upcoming':'Active'}/></div>{overlap.length>0 && <p className="reg-warning">Conflict warning reviewed: {overlap.map(c=>c.name).join(', ')}</p>}</div>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={confirmed?()=>setConfirmed(false):onClose}>{confirmed?'Back':'Cancel'}</button><button disabled={duplicate} className="reg-primary" type="submit">{confirmed?'Confirm enrolment':'Review enrolment'} <ArrowRight size={16}/></button></div>
    </form>
  </Modal>;
}
function EditName({kind,record,onSave,onClose}: any) {
  const [name,setName]=useState(kind==='family'?record.parentName:record.name);
  return <Modal title={`Edit ${kind} details`} subtitle="Updates only the shared identity record. Academic records remain institution-specific." onClose={onClose}>
    <form className="reg-form" onSubmit={e=>{e.preventDefault();if(clean(name))onSave(clean(name));}}><Field label={kind==='family'?'Parent / guardian name *':'Student name *'}><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)}/></Field><div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary">Save changes</button></div></form>
  </Modal>;
}
function ConfirmRemove({title,description,actionLabel,onClose,onConfirm,blocked=false,onDemoHardDelete}: any) {
  const [word,setWord]=useState('');
  return <Modal title={title} subtitle="Protected removal — local session only" onClose={onClose}><div className="reg-form"><div className={blocked?'reg-warning':'reg-info'}><CircleAlert size={17}/><span>{description}</span></div><div className="reg-modal-actions"><button className="reg-secondary" onClick={onClose}>Cancel</button>{!blocked&&<button className="reg-danger" onClick={onConfirm}><Trash2 size={15}/>{actionLabel}</button>}</div>
    {onDemoHardDelete&&<div className="reg-form"><div className="reg-form-section">Discard local records</div><p className="reg-muted">To test full Delete, type DELETE. This clears linked local enrolments and practice records. It does not affect DynamoDB. Live deletion will require separate safeguards.</p><Field label="Type DELETE to confirm"><input value={word} onChange={e=>setWord(e.target.value)} placeholder="DELETE" autoComplete="off"/></Field><button type="button" className="reg-danger" disabled={word!=='DELETE'} onClick={onDemoHardDelete}><Trash2 size={15}/> Discard local records</button></div>}
  </div></Modal>;
}
function EditEnrolment({entry,onSave,onClose}: any) {
  const [startDate,setStartDate]=useState(entry.startDate);
  const [endDate,setEndDate]=useState(entry.endDate||'');
  const [error,setError]=useState('');
  return <Modal title="Edit enrolment dates" subtitle="End dates archive an enrolment after its final active day." onClose={onClose}><form className="reg-form" onSubmit={e=>{e.preventDefault();if(endDate&&endDate<startDate)return setError('End date cannot be before start date.');onSave({startDate,endDate});}}><div className="reg-form-grid"><Field label="Start date"><input type="date" required value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field><Field label="End date (optional)"><input type="date" min={startDate} value={endDate} onChange={e=>setEndDate(e.target.value)}/></Field></div>{error&&<p className="reg-error">{error}</p>}<div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary">Save enrolment</button></div></form></Modal>;
}
function FamilyDetail({ family, members, enrolments, workspace, onBack, onAddChild, onEnrol, onEditPhone, onEditName, onDelete }: any) {
  const children=members.filter(m=>m.familyId===family.id);
  return <>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Family directory</button>
    <div className="reg-page-header"><div><p className="reg-kicker">SHARED FAMILY RECORD · {family.id}</p><h1>{family.parentName}</h1><p>Core contact details shared across Raagasudha and Śruti Vedam.</p></div><button className="reg-primary" onClick={onAddChild}><Plus size={16}/> Add student</button></div>
    <div className="reg-columns"><section className="surface reg-section"><h2>Parent / guardian</h2><div className="reg-info-row"><span>Family ID</span><strong>{family.id}</strong></div><div className="reg-info-row"><span>Primary contact</span><strong>{family.parentName}</strong></div><div className="reg-info-row"><span>WhatsApp</span><strong>{maskPhone(family.phone)}</strong></div><div className="reg-actions"><button className="reg-secondary" onClick={onEditPhone}>Update contact</button><button className="reg-secondary" onClick={onEditName}><Pencil size={15}/> Edit name</button><button className="reg-danger" onClick={onDelete}><Trash2 size={15}/> Delete family</button></div><div className="reg-info"><ShieldCheck size={16}/><span>Communication consent and Reminder Service activation are not part of this local session.</span></div></section><section className="surface reg-section"><div className="reg-section-head"><h2>Students in family</h2><span className="reg-count">{children.length}</span></div><div className="reg-stack">{children.map(m=>{const enrol=enrolments.filter(e=>e.studentId===m.id&&e.institution===workspace);return <div className="reg-person" key={m.id}><StudentAvatar name={m.name}/><div><strong>{m.name}</strong><small>{m.id} · {m.phone?`Own WhatsApp: ${maskPhone(m.phone)} · `:'Uses family contact · '}{enrol.length ? `${enrol.length} ${institutions[workspace].name} enrolment(s)` : `Not enrolled at ${institutions[workspace].name}`}</small></div><button onClick={()=>onEnrol(m.id)} className="reg-outline-small">Enrol</button></div>})}</div></section></div>
  </>;
}
function ChangePhone({ family, onClose, onSave }: any) {
  const [value,setValue]=useState(family.phone || '');const [error,setError]=useState('');
  return <Modal title="Update family contact" subtitle="The shared family contact changes for both institutions." onClose={onClose}><form className="reg-form" onSubmit={e=>{e.preventDefault();const phone=value.replace(/[\s-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(phone))return setError('Please enter a valid international number.');onSave(phone);}}><PhoneField label="Parent / guardian WhatsApp" value={value} onChange={setValue}/><div className="reg-warning"><CircleAlert size={17}/><span>Sadhana does not yet send WhatsApp messages. Once messaging is enabled, number changes must only be made for authorised contacts.</span></div>{error && <p className="reg-error" role="alert">{error}</p>}<div className="reg-modal-actions"><button className="reg-secondary" type="button" onClick={onClose}>Cancel</button><button className="reg-primary">Save shared contact</button></div></form></Modal>;
}
function ChangeStudentPhone({ student, onClose, onSave }: any) {
  const [value,setValue]=useState(student?.phone || '');
  const [error,setError]=useState('');
  return <Modal title="Student WhatsApp contact" subtitle={`Optional personal number for ${student?.name}. Shared parent contact remains unchanged.`} onClose={onClose}>
    <form className="reg-form" onSubmit={e=>{e.preventDefault();const phone=value.replace(/[\s-]/g,'');if(phone && !/^\+[1-9]\d{7,14}$/.test(phone))return setError('Use international format, or leave blank to use the parent number.');onSave(phone);}}>
      <PhoneField label="Student mobile" value={value} onChange={setValue} optional hint="Leave blank to use the family contact."/>
      <div className="reg-info"><Info size={17}/><span>Setting a mobile number does not activate WhatsApp reminders or grant permission. Consent and contact authorisation are handled later.</span></div>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button className="reg-secondary" type="button" onClick={onClose}>Cancel</button><button className="reg-primary" type="submit">Save student contact</button></div>
    </form>
  </Modal>;
}

function StudentRecord({ person, family, enrollments, workspace, classes, onBack, onEnrol, onEditMobile, onEditName, onRemove, onRestore, onEditEnrol, practiceLogs=[] }: any) {
  const [tab,setTab]=useState('Overview');
  const list=enrollments.filter(e=>e.studentId===person.id && e.institution===workspace);
  const period=lastFourWeeks();
  const calculated=reportForStudent(person.id,workspace,period.from,period.to,enrollments,classes,practiceLogs);
  const visible=list.filter(e=>getEnrolmentStatus(e)!=='Archived');
  return <>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Students</button>
    <div className="reg-page-header"><div><p className="reg-kicker">{institutions[workspace].name.toUpperCase()} · STUDENT PROFILE</p><h1>{person.name}</h1><p>{person.id} · Institution-specific student profile</p></div><div className="reg-actions"><button className="reg-primary" onClick={()=>onEnrol(person.id)}><Plus size={16}/> Enrol in class</button><button className="reg-secondary" onClick={onEditName}><Pencil size={15}/> Edit details</button>{person.archived?<button className="reg-secondary" onClick={onRestore}><RotateCcw size={15}/> Restore student</button>:<button className="reg-danger" onClick={onRemove}><Trash2 size={15}/> Remove student</button>}</div></div>
    <section className="surface reg-section"><div className="reg-tabs">{['Overview','Classes','Practice','Attendance','Notes'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div>
      {tab==='Overview'&&<div className="reg-two-inner"><div><h2>Student information</h2><div className="reg-info-row"><span>Student ID</span><strong>{person.id}</strong></div><div className="reg-info-row"><span>Family ID</span><strong>{family?.id || "Not applicable"}</strong></div><div className="reg-info-row"><span>Parent / guardian</span><strong>{family?.parentName || "Independent adult"}</strong></div><div className="reg-info-row"><span>Contact</span><strong>{family ? maskPhone(family.phone) : maskPhone(person.phone)}</strong></div><div className="reg-info-row"><span>Student WhatsApp</span><strong>{person.phone ? maskPhone(person.phone) : family ? "Uses parent’s number" : "Not recorded"}</strong></div><button type="button" className="reg-secondary" onClick={()=>onEditMobile(person.id)}>Edit student WhatsApp</button><div className="reg-info-row"><span>Current classes</span><strong>{visible.length}</strong></div></div><div className="reg-feature"><h3>Practice snapshot</h3><div className="reg-metrics"><div><strong>{calculated.practiceRate==null?'No data':`${calculated.practiceRate}%`}</strong><span>Practice Rate</span></div><div><strong>{calculated.submissionRate==null?'No data':`${calculated.submissionRate}%`}</strong><span>Submission Rate</span></div></div><small>Calculated only from records entered in this browser session; live practice history is not connected yet.</small></div></div>}
      {tab==='Classes'&&<><h2>Class enrolments</h2><div className="reg-stack">{list.length?list.map(e=>{const c=classes.find(c=>c.id===e.classId);return <div className="reg-enrol-row" key={e.id}><GraduationCap size={19}/><div><strong>{c?.name}</strong><small>{fmtDate(e.startDate)} {e.endDate?`– ${fmtDate(e.endDate)}`:''} · {e.id}</small></div><Status status={getEnrolmentStatus(e)}/><button className="reg-secondary" onClick={()=>onEditEnrol(e)}>Edit dates</button></div>}):<NoResults title="No enrolment yet" detail="Use Enrol in class to create a record."/>}</div></>}
      {tab==='Practice'&&<><h2>Practice records (last four weeks)</h2><div className="reg-metrics"><div><strong>{calculated.practiceRate==null?'No data':calculated.practiceRate+'%'}</strong><span>Practice Rate</span></div><div><strong>{calculated.submissionRate==null?'No data':calculated.submissionRate+'%'}</strong><span>Submission Rate</span></div><div><strong>{calculated.minutes} min</strong><span>Total minutes</span></div></div><p className="reg-muted">Record or correct practice from Practice & Reports. Voided records do not contribute to totals.</p><div className="reg-stack">{practiceLogs.filter(l=>l.studentId===person.id&&l.institution===workspace&&l.date>=period.from&&l.date<=period.to).sort((a,b)=>b.date.localeCompare(a.date)).map(l=><div className="reg-enrol-row" key={l.id}><CalendarDays size={16}/><div><strong>{l.date}: {l.didPractice?'Yes':'No'} · {l.minutes} min</strong><small>{l.comments||'No comment'} · {l.status}</small></div></div>)}</div></>}
      {tab==='Attendance'&&<><h2>Attendance RSVPs</h2><p className="reg-muted">Session RSVP information will be connected in the attendance phase.</p></>}
      {tab==='Notes'&&<><h2>Internal teacher notes</h2><p className="reg-muted">Protected institutional notes remain separate and are not included in report exports.</p><NoResults title="No teacher notes" detail="Teacher notes will appear after this feature is connected to the database."/></>}
    </section>
  </>;
}

export default function RegistrationModule({workspace, families, members, enrolments, classes, setFamilies, setMembers, setEnrolments, initialClass=null, initialStudent=null, practiceLogs=[], setPracticeLogs=()=>{}}: any) {
  const [area,setArea] = useState('students');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('All');
  const [familyFocus,setFamilyFocus]=useState(null);
  const [studentFocus,setStudentFocus]=useState(initialStudent);
  const [dialog,setDialog]=useState(initialClass ? 'enrol' : null);
  const [selectedStudent,setSelectedStudent]=useState('');
  const [selectedClass,setSelectedClass]=useState(initialClass || '');
  const [flash,setFlash]=useState('');
  const [editEnrol,setEditEnrol]=useState(null);
  const scoped = useMemo(()=>enrolments.filter(e=>e.institution===workspace),[enrolments,workspace]);
  const scopedIds = new Set(scoped.map(e=>e.studentId));
  const studentsInWorkspace = members.filter(m=>scopedIds.has(m.id) || m.createdIn===workspace);
  const visibleStudents = studentsInWorkspace.filter(m=>{
    const matches=clean(`${m.name} ${m.id} ${families.find(f=>f.id===m.familyId)?.parentName}`).toLowerCase().includes(query.toLowerCase());
    const statuses=scoped.filter(e=>e.studentId===m.id).map(getEnrolmentStatus);
    const status=m.archived?'Archived':statuses.includes('Active')?'Active':statuses.includes('Upcoming')?'Upcoming':statuses.includes('Archived')?'Archived':'Registered';
    return matches && (filter==='All'?status!=='Archived':filter===status);
  });
  const visibleFamilies=families.filter(f=>f.createdIn===workspace || members.some(m=>m.familyId===f.id && scopedIds.has(m.id))).filter(f=>`${f.parentName} ${f.id} ${members.filter(m=>m.familyId===f.id).map(m=>m.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const openEnrol=(studentId='',classId='')=>{setSelectedStudent(studentId);setSelectedClass(classId);setDialog('enrol');};
  const register=values=>{
    const fam={id:newId('FAM',families),parentName:values.parentName,phone:values.phone,createdIn:workspace};
    const member={id:newId('STU',members),name:values.studentName,phone:values.studentPhone || '',familyId:fam.id};
    setFamilies(prev=>[...prev,fam]);setMembers(prev=>[...prev,member]);setDialog(null);setArea('families');setQuery('');setFamilyFocus(fam.id);setFlash(`${member.name} registered in ${fam.id}. Add an enrolment when ready.`);
  };
  const registerIndependent=values=>{
    const member={id:newId('STU',members),name:values.name,phone:values.phone,familyId:null,isIndependent:true,createdIn:workspace};
    setMembers(prev=>[...prev,member]);setDialog(null);setArea('students');setQuery('');setStudentFocus(member.id);
    setFlash(`${member.name} registered independently without a family record. Enrol them in a class when ready.`);
  };
  const addChild=values=>{const member={id:newId('STU',members),name:values.name,phone:values.phone || '',familyId:familyFocus};setMembers(prev=>[...prev,member]);setDialog(null);setFlash(`${values.name} added to family.`);};
  const saveEnrol=values=>{
    const record={...values,id:newId('ENR',enrolments),institution:workspace,endDate:''};
    setEnrolments(prev=>[...prev,record]);setDialog(null);setStudentFocus(values.studentId);setFamilyFocus(null);setArea('students');setQuery('');setFilter('All');setFlash(`${members.find(m=>m.id===values.studentId)?.name} enrolled in ${classes.find(c=>c.id===values.classId)?.name}.`);
  };
  const [phoneForStudent,setPhoneForStudent]=useState('');
  const family=families.find(f=>f.id===familyFocus);
  const person=members.find(m=>m.id===studentFocus);
  return <div className="reg-module">
    {flash && <div className="reg-success" role="status"><CheckCircle2 size={17}/><span>{flash} Changes are local to this browser session and are not saved to DynamoDB.</span><button aria-label="Dismiss" onClick={()=>setFlash('')}><X size={15}/></button></div>}
    {family ? <FamilyDetail family={family} members={members} enrolments={enrolments} workspace={workspace} onBack={()=>setFamilyFocus(null)} onAddChild={()=>setDialog('child')} onEnrol={id=>openEnrol(id)} onEditPhone={()=>setDialog('phone')} onEditName={()=>setDialog('family-name')} onDelete={()=>setDialog('remove-family')}/> : person ? <StudentRecord key={`${workspace}-${person.id}`} person={person} family={families.find(f=>f.id===person.familyId)} enrollments={enrolments} workspace={workspace} onBack={()=>setStudentFocus(null)} onEnrol={id=>openEnrol(id)} classes={classes} onEditMobile={id=>{setPhoneForStudent(id);setDialog('student-phone');}} onEditName={()=>setDialog('student-name')} onRemove={()=>setDialog('remove-student')} onRestore={()=>{setMembers(prev=>prev.map(m=>m.id===person.id?{...m,archived:false}:m));setFlash('Student identity restored (local only).');}} onEditEnrol={e=>{setEditEnrol(e);setDialog('edit-enrol');}} practiceLogs={practiceLogs}/> : <>
      <div className="reg-page-header"><div><p className="reg-kicker">FAMILY & STUDENT MANAGEMENT</p><h1>Families & Students</h1><p>Shared family identities. Separate {institutions[workspace].name} enrolments and student profiles.</p></div><div className="reg-actions"><button className="reg-secondary" onClick={()=>openEnrol()}><GraduationCap size={17}/> Enrol existing student</button><button className="reg-secondary" onClick={()=>setDialog('independent')}><Plus size={17}/> Independent student</button><button className="reg-primary" onClick={()=>setDialog('family')}><Plus size={17}/> Register family</button></div></div>
      <section className="surface reg-section"><div className="reg-toolbar"><div className="reg-tabs"><button className={area==='students'?'active':''} onClick={()=>{setArea('students');setQuery('');}}>Students</button><button className={area==='families'?'active':''} onClick={()=>{setArea('families');setQuery('');}}>Families</button></div><div className="reg-search"><Search size={17}/><input aria-label="Search family or student" placeholder={area==='students'?'Search students…':'Search families…'} value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
        {area==='students' && <div className="reg-filter-line">{['All','Active','Upcoming','Registered','Archived'].map(t=><button key={t} className={filter===t?'current':''} onClick={()=>setFilter(t)}>{t}</button>)}</div>}
        {area==='families'? <div className="reg-stack">{visibleFamilies.map(f=><button key={f.id} className="reg-entry" onClick={()=>setFamilyFocus(f.id)}><span className="reg-icon"><UsersRound size={19}/></span><div className="reg-entry-main"><strong>{f.parentName}</strong><small>{f.id} · {members.filter(m=>m.familyId===f.id).length} student(s) · {maskPhone(f.phone)}</small></div><ChevronRight size={18}/></button>)}{!visibleFamilies.length&&<NoResults title="No families found" detail="Register a family to create a shared parent and student identity."/>}</div> : <div className="reg-stack">{visibleStudents.map(m=>{const family=families.find(f=>f.id===m.familyId);const entries=scoped.filter(e=>e.studentId===m.id);const status=m.archived?'Archived':entries.map(getEnrolmentStatus).includes('Active')?'Active':entries.map(getEnrolmentStatus).includes('Upcoming')?'Upcoming':entries.map(getEnrolmentStatus).includes('Archived')?'Archived':'Registered';return <button className="reg-entry" key={m.id} onClick={()=>setStudentFocus(m.id)}><StudentAvatar name={m.name}/><div className="reg-entry-main"><strong>{m.name}</strong><small>{m.id} · {entries.map(e=>classes.find(c=>c.id===e.classId)?.name).filter(Boolean).join(', ')} · {family?.parentName || 'Independent learner'}</small></div><Status status={status}/><ChevronRight size={18}/></button>})}{!visibleStudents.length&&<NoResults title="No matching students" detail="Register a family, register an independent adult student or enrol an existing student to get started."/>}</div>}
        <p className="reg-footnote"><Info size={15}/> Registration is not connected to DynamoDB yet. Entries are temporary and disappear on refresh. Please do not enter real family or student information.</p>
      </section>
    </>}
    {dialog==='family'&&<RegisterFamily onClose={()=>setDialog(null)} onSave={register}/>}
    {dialog==='independent'&&<RegisterIndependent onClose={()=>setDialog(null)} onSave={registerIndependent}/>}
    {dialog==='child'&&family&&<AddChild family={family} onClose={()=>setDialog(null)} onSave={addChild}/>}
    {dialog==='enrol'&&<EnrolModal classes={classes} workspace={workspace} families={families} members={members} enrolments={enrolments} presetStudent={selectedStudent} presetClass={selectedClass} onSave={saveEnrol} onClose={()=>setDialog(null)}/>}
    {dialog==='student-phone'&&phoneForStudent&&<ChangeStudentPhone student={members.find(m=>m.id===phoneForStudent)} onClose={()=>setDialog(null)} onSave={phone=>{setMembers(prev=>prev.map(m=>m.id===phoneForStudent?{...m,phone}:m));setDialog(null);setFlash('Student WhatsApp number updated (local only).');}}/>}
    {dialog==='phone'&&family&&<ChangePhone family={family} onClose={()=>setDialog(null)} onSave={phone=>{setFamilies(prev=>prev.map(f=>f.id===family.id?{...f,phone}:f));setDialog(null);setFlash('Shared contact updated for this local-only family.');}}/>}
    {dialog==='family-name'&&family&&<EditName kind="family" record={family} onClose={()=>setDialog(null)} onSave={name=>{setFamilies(prev=>prev.map(f=>f.id===family.id?{...f,parentName:name}:f));setDialog(null);setFlash('Family name updated.');}}/>}
    {dialog==='student-name'&&person&&<EditName kind="student" record={person} onClose={()=>setDialog(null)} onSave={name=>{setMembers(prev=>prev.map(m=>m.id===person.id?{...m,name}:m));setDialog(null);setFlash('Student details updated.');}}/>}
    {dialog==='remove-family'&&family&&<ConfirmRemove title="Delete family" description={members.some(m=>m.familyId===family.id)?'This family still has linked students. Remove or archive the students first; family deletion is blocked to prevent orphan records.':'Delete this empty local-only family? This cannot be undone during this session.'} blocked={members.some(m=>m.familyId===family.id)} onDemoHardDelete={()=>{const linkedMembers=members.filter(m=>m.familyId===family.id).map(m=>m.id);setFamilies(prev=>prev.filter(f=>f.id!==family.id));setMembers(prev=>prev.filter(m=>!linkedMembers.includes(m.id)));setEnrolments(prev=>prev.filter(e=>!linkedMembers.includes(e.studentId)));setPracticeLogs(prev=>prev.filter(l=>!linkedMembers.includes(l.studentId)));setFamilyFocus(null);setDialog(null);setFlash('Family and linked local-only student data deleted across workspaces.');}} actionLabel="Delete empty family" onClose={()=>setDialog(null)} onConfirm={()=>{setFamilies(prev=>prev.filter(f=>f.id!==family.id));setFamilyFocus(null);setDialog(null);setFlash('Empty family deleted from local session.');}}/>}
    {dialog==='remove-student'&&person&&<ConfirmRemove title={enrolments.some(e=>e.studentId===person.id)?'Archive institution enrolments':'Delete student'} description={enrolments.some(e=>e.studentId===person.id)?'This student has linked enrolments. The current institution’s enrolments will be archived; records at the other academy will stay unchanged.':'This student has no enrolments. Delete this local-only identity?'} actionLabel={enrolments.some(e=>e.studentId===person.id)?'Archive student':'Delete student'} onDemoHardDelete={()=>{setMembers(prev=>prev.filter(m=>m.id!==person.id));setEnrolments(prev=>prev.filter(e=>e.studentId!==person.id));setPracticeLogs(prev=>prev.filter(l=>l.studentId!==person.id));setStudentFocus(null);setDialog(null);setFlash('Student and linked local-only history deleted from both institutions.');}} onClose={()=>setDialog(null)} onConfirm={()=>{if(enrolments.some(e=>e.studentId===person.id)){setMembers(prev=>prev.map(m=>m.id===person.id && !enrolments.some(e=>e.studentId===person.id&&e.institution!==workspace)?{...m,archived:true}:m));setEnrolments(prev=>prev.map(e=>e.studentId===person.id&&e.institution===workspace?{...e,archived:true,endDate:e.endDate||ukISODate()}:e));setFlash('Student enrolments archived in this institution. Other institution remains unaffected.');}else{setMembers(prev=>prev.filter(m=>m.id!==person.id));setFlash('Unenrolled student deleted from local session.');}setStudentFocus(null);setDialog(null);}}/>}
    {dialog==='edit-enrol'&&editEnrol&&<EditEnrolment entry={editEnrol} onClose={()=>setDialog(null)} onSave={v=>{setEnrolments(prev=>prev.map(e=>e.id===editEnrol.id?{...e,...v}:e));setDialog(null);setFlash('Enrolment dates updated.');}}/>}

  </div>;
}
