import { DirectoryDataMenu, StudentCardBadges } from './DirectoryComponents';
import { persistArchiveState } from './archiveLifecycle';
import { filterStudentsByLocation, sortDirectoryStudents } from './directorySelectors';
import './registrationUxPolish.css';
import './familyCardsV096.css';
import { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronRight,
  CircleAlert, GraduationCap, Info, Plus, Search, ShieldCheck,
  UsersRound, X, Trash2, Pencil, Archive, RotateCcw, CalendarDays, Download, Upload, List, Table2,
} from 'lucide-react';
import { institutions } from './institutions';
import { getEnrolmentStatus, maskPhone, newId, ukISODate } from './registry';
import PhoneField from './PhoneField';
import {lastFourWeeks,reportForStudent} from './practiceMath';

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
// Public identifiers are immutable DynamoDB attributes; UUIDs remain internal keys.
const familyLabel = (family: any) => family?.familyNumber || 'Pending family number';
const studentLabel = (student: any) => student?.rollNumber || 'Pending roll number';
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
const relationshipLabel=(student:any)=> !student?.familyId?'Independent Student':student?.relationship==='parent_guardian'?'Parent / Guardian + Student':student?.relationship==='other'?'Other Family Member + Student':'Child + Student';
const fmtDate = value => value ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)) : '—';

function RegisterFamily({ onSave, onClose }: any) {
  const [parentName,setParentName]=useState('');
  const [phone,setPhone]=useState('');
  const [location,setLocation]=useState('');
  const [parentLearner,setParentLearner]=useState(false);
  const [members,setMembers]=useState([{uid:1,name:'',phone:'',relationship:'child'}]);
  const [nextUid,setNextUid]=useState(2);
  const [error,setError]=useState('');
  const change=(uid:number,part:any)=>setMembers(prev=>prev.map(m=>m.uid===uid?{...m,...part}:m));
  const submit=(e:any)=>{
    e.preventDefault();
    const familyPhone=phone.replace(/[\s-]/g,'');
    if(!clean(parentName)||!/^\+[1-9]\d{7,14}$/.test(familyPhone))return setError('Enter guardian name and a valid international WhatsApp number.');
    const learners=members.map(m=>({name:clean(m.name),phone:m.phone.replace(/[\s-]/g,''),relationship:m.relationship}));
    if(parentLearner)learners.unshift({name:clean(parentName),phone:familyPhone,relationship:'parent_guardian'});
    if(!learners.length||learners.some(m=>!m.name||m.phone&&!/^\+[1-9]\d{7,14}$/.test(m.phone)))return setError('Add at least one learner and check all learner names and contact numbers.');
    const names=learners.map(m=>m.name.toLowerCase());
    if(new Set(names).size!==names.length)return setError('Each learner must have a distinct name in this registration.');
    setError('');onSave({parentName:clean(parentName),phone:familyPhone,location:clean(location),members:learners});
  };
  return <Modal title="Register a family" subtitle="Create one family and several learner records together. Only learners receive roll numbers." onClose={onClose}>
    <form onSubmit={submit} className="reg-form">
      <div className="reg-form-section">Parent / guardian</div>
      <div className="reg-family-contact-fields"><Field label="Parent / guardian name *"><input autoFocus required maxLength={90} value={parentName} onChange={e=>setParentName(e.target.value)} placeholder="Full name"/></Field><PhoneField label="WhatsApp" value={phone} onChange={setPhone}/></div>
      <Field label="Town / City"><input maxLength={120} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Newcastle"/></Field>
      <label className="reg-checkbox"><input type="checkbox" checked={parentLearner} onChange={e=>setParentLearner(e.target.checked)}/><span>Parent / guardian is also a student</span></label>
      {parentLearner&&<p className="reg-footnote">The parent will receive a student record classified as Parent / Guardian + Student.</p>}
      <div className="reg-form-section">Family learners</div>
      {members.map((m,i)=><div key={m.uid} className="reg-review reg-family-member-card">
        <div className="reg-section-head"><strong>Family member {i+1}</strong><button type="button" className="reg-outline-small" onClick={()=>setMembers(v=>v.filter(x=>x.uid!==m.uid))}><X size={14}/> Remove</button></div>
        <Field label="Full name *"><input maxLength={90} value={m.name} onChange={e=>change(m.uid,{name:e.target.value})} placeholder="Full name"/></Field>
        <Field label="Classification"><select value={m.relationship} onChange={e=>change(m.uid,{relationship:e.target.value})}><option value="child">Child + Student</option><option value="other">Other Family Member + Student</option><option value="parent_guardian">Parent / Guardian + Student</option></select></Field>
        <Field label="WhatsApp (optional)"><input value={m.phone} onChange={e=>change(m.uid,{phone:e.target.value})} placeholder="Uses family contact"/></Field>
      </div>)}
      <button type="button" className="reg-secondary" onClick={()=>{setMembers(v=>[...v,{uid:nextUid,name:'',phone:'',relationship:'child'}]);setNextUid(x=>x+1);}}><Plus size={16}/> Add another family member</button>
      <div className="reg-info"><ShieldCheck size={17}/><span>{members.length+(parentLearner?1:0)} student record(s) will be created. Guardians not studying stay in the family directory only. Messaging is not activated.</span></div>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary">Create family & learners</button></div>
    </form>
  </Modal>;
}
function RegisterIndependent({ onSave, onClose }: any) {
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [adult,setAdult]=useState(false);
  const [location,setLocation]=useState('');
  const [error,setError]=useState('');
  const submit=e=>{
    e.preventDefault();
    const normalized=phone.replace(/[\s-]/g,'');
    if(!clean(name)) return setError('Enter the student name.');
    if(!/^\+[1-9]\d{7,14}$/.test(normalized)) return setError('Enter a valid student WhatsApp number with an international country code.');
    if(!adult) return setError('Independent registration is available to adults aged 18 or older.');
    onSave({name:clean(name),phone:normalized,location:clean(location)});
  };
  return <Modal title="Register an independent student" subtitle="For adult learners with their own contact details and no family record." onClose={onClose}>
    <form className="reg-form" onSubmit={submit}>
      <Field label="Student full name *"><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)} placeholder="Adult learner name"/></Field>
      <PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} hint="Independent Students use their own contact number."/>
      <Field label="Town / City"><input maxLength={120} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Carlisle"/></Field>
      <label className="reg-checkbox"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/><span>I confirm that this learner is 18 or older.</span></label>
      <div className="reg-info"><ShieldCheck size={17}/><span>Independent students are registered without a family record and receive their own permanent Student ID. They can be linked to a family later.</span></div>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary"><Plus size={16}/> Register student</button></div>
    </form>
  </Modal>;
}
function AddChild({ family, onSave, onClose }: any) {
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [error,setError]=useState('');
  return <Modal title="Add another student" subtitle={`Add a student to ${familyLabel(family)}, without duplicating family contacts.`} onClose={onClose}><form className="reg-form" onSubmit={e=>{e.preventDefault();if(!clean(name))return;const normalized=phone.replace(/[\s-]/g,'');if(normalized && !/^\+[1-9]\d{7,14}$/.test(normalized))return setError('Enter a valid international phone number or leave it blank.');onSave({name:clean(name),phone:normalized,location:clean(family.location||'')});}}><Field label="Student full name *"><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"/></Field><PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} optional/>{error&&<p className="reg-error" role="alert">{error}</p>}<div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary"><Plus size={16}/> Add student</button></div></form></Modal>;
}
function EnrolModal({ workspace, members, families, enrolments, classes: classRecords, presetStudent, presetClass, onClose, onSave }: any) {
  const [studentId,setStudentId] = useState(presetStudent || '');
  const [studentQuery,setStudentQuery]=useState('');
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
  return <Modal title="Enrol student" subtitle={`Add an enrolment to ${institutions[workspace].name}; student IDs are preserved.`} onClose={onClose}>
    <form className="reg-form" onSubmit={confirmed ? e=>{e.preventDefault();onSave({studentId,classId,startDate});} : check}>
      {!confirmed ? <>
        <Field label="Find student"><input value={studentQuery} onChange={e=>setStudentQuery(e.target.value)} placeholder="Search name or roll number"/></Field><Field label="Select student *"><select required value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Choose student</option>{members.filter(m=>!studentQuery||`${m.name} ${studentLabel(m)}`.toLowerCase().includes(studentQuery.toLowerCase())||m.id===studentId).map(m=><option key={m.id} value={m.id}>{m.name} · {studentLabel(m)}</option>)}</select></Field>
        <Field label="Class *"><select required value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}</select></Field>
        <Field label="Enrolment start date *"><input type="date" required value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>
        {person && <div className="reg-info"><Info size={17}/><span>Student match: {person.name} ({studentLabel(person)}), {fam ? `Family ${familyLabel(fam)}` : "Independent learner"}. Student identity is shared across academies; enrolments are academy-specific.</span></div>}
        {duplicate && <p className="reg-error" role="alert">Already enrolled or due to join this class.</p>}
        {overlap.length>0 && <div className="reg-warning"><CircleAlert size={17}/><span>Possible overlapping class: {overlap.map(c=>c.name).join(', ')}. You may review and proceed.</span></div>}
        {error && <p className="reg-error" role="alert">{error}</p>}
      </> : <div className="reg-review"><h3>Review enrolment</h3><div><span>Student</span><strong>{person?.name} ({studentLabel(person)})</strong></div><div><span>Institution</span><strong>{institutions[workspace].name}</strong></div><div><span>Class</span><strong>{selectedClass?.name}</strong></div><div><span>Starts</span><strong>{fmtDate(startDate)}</strong></div><div><span>Status</span><Status status={startDate>ukISODate()?'Upcoming':'Active'}/></div>{overlap.length>0 && <p className="reg-warning">Conflict warning reviewed: {overlap.map(c=>c.name).join(', ')}</p>}</div>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={confirmed?()=>setConfirmed(false):onClose}>{confirmed?'Back':'Cancel'}</button><button disabled={duplicate} className="reg-primary" type="submit">{confirmed?'Confirm enrolment':'Review enrolment'} <ArrowRight size={16}/></button></div>
    </form>
  </Modal>;
}
function EditName({kind,record,family,onSave,onClose}: any) {
  const [name,setName]=useState(kind==='family'?record.parentName:record.name);
  const [location,setLocation]=useState(record.location||family?.location||'');
  const [phone,setPhone]=useState(record.phone||'');
  const [relationship,setRelationship]=useState(record.relationship||'child');
  const [error,setError]=useState('');
  return <Modal title="Update student" subtitle="Update student name and town/city. The roll number stays unchanged." onClose={onClose}>
    <form className="reg-form" onSubmit={e=>{e.preventDefault();if(clean(name)){const n=phone.replace(/[\s-]/g,'');if(n&&!/^\+[1-9]\d{7,14}$/.test(n))return setError('Enter an international phone number, or leave it blank.');onSave({name:clean(name),location:clean(location),phone:n,...(record.familyId?{relationship}:{})});}}}>
      <Field label="Student name *"><input autoFocus required maxLength={90} value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field label="Town / City"><input maxLength={120} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Newcastle"/></Field>
      <PhoneField label="Student WhatsApp" value={phone} onChange={setPhone} optional/>
      {record.familyId&&<Field label="Family classification"><select value={relationship} onChange={e=>setRelationship(e.target.value)}><option value="child">Child + Student</option><option value="parent_guardian">Parent / Guardian + Student</option><option value="other">Other Family Member + Student</option></select></Field>}
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary">Save changes</button></div>
    </form>
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
function FamilyDetail({ family, members, enrolments, workspace, classes, onBack, onAddChild, onEnrol, onUpdate, onArchive, onRestore, onOpenStudent, onArchiveStudent, onRestoreStudent }: any) {
  const children=members.filter(m=>m.familyId===family.id);
  return <>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Family directory</button>
    <div className="reg-page-header"><div><p className="reg-kicker">SHARED FAMILY RECORD · {familyLabel(family)}</p><h1>{family.parentName}</h1><p>Family details and student enrolments.</p></div><button className="reg-primary" onClick={onAddChild} disabled={!!family.archived}><Plus size={16}/> Add student</button></div>
    <div className="reg-family-layout">
      <section className="surface reg-section reg-guardian-card">
        <div className="reg-section-head"><h2>Parent / guardian</h2><span className="reg-family-number">#{familyLabel(family)}</span></div>
        <div className="reg-info-row"><span>Primary contact</span><strong>{family.parentName}</strong></div>
        <div className="reg-info-row"><span>Location</span><strong>{family.location||'—'}</strong></div>
        <div className="reg-info-row"><span>WhatsApp</span><strong>{maskPhone(family.phone)}</strong></div>
        <div className="reg-actions reg-family-action-row">
          <button className="reg-secondary" onClick={onUpdate}><Pencil size={15}/> Edit family details</button>
          {family.archived
            ? <button className="reg-secondary" onClick={onRestore}><RotateCcw size={15}/> Restore family</button>
            : <button className="reg-secondary reg-family-archive" onClick={onArchive}><Archive size={15}/> Archive family</button>}
        </div>
        <div className="reg-info"><ShieldCheck size={16}/><span>Communication consent and Reminder Service activation are managed separately.</span></div>
      </section>
      <section className="surface reg-section reg-family-students">
        <div className="reg-section-head"><div><h2>Students in family</h2><p className="reg-students-subtitle">{children.length} registered {children.length===1?'student':'students'} · Family {familyLabel(family)}</p></div><span className="reg-count">{children.length}</span></div>
        <div className="reg-student-cards">{children.map(m=>{
          const allEnrolments=enrolments.filter(e=>e.studentId===m.id&&e.institution===workspace&&!e.archived);
          const activeEnrolments=allEnrolments.filter(e=>['Active','Upcoming'].includes(getEnrolmentStatus(e)));
          const names: string[] = [...new Set<string>(allEnrolments.map(e=>String(classes.find(c=>c.id===e.classId)?.name||'')).filter(Boolean))];
          const enrolmentStatus=m.archived?'Archived':activeEnrolments.length?'Enrolled':names.length?'Past enrolment':'Not enrolled';
          return <article className={`reg-student-card${m.archived?' reg-student-card-archived':''}`} key={m.id}>
            <div className="reg-student-main">
              <StudentAvatar name={m.name}/>
              <div className="reg-student-details">
                <button type="button" className="reg-student-name" onClick={()=>onOpenStudent(m.id)}>{m.name}</button>
                <div className="reg-student-meta"><span className="reg-roll-pill">{studentLabel(m)}</span><span>{relationshipLabel(m)}</span><span>{m.phone?`WhatsApp ${maskPhone(m.phone)}`:'Family contact'}</span></div>
              </div>
              <div className="reg-card-icon-actions" role="group" aria-label={`Actions for ${m.name}`}>
                <button type="button" className="reg-card-icon" title={`Edit profile: ${m.name}`} aria-label={`Edit profile for ${m.name}`} data-hint="Edit profile" onClick={()=>onOpenStudent(m.id)}><Pencil size={16}/></button>
                <button type="button" className="reg-card-icon" title={m.archived||family.archived?'Restore the archived record before enrolling':`Enrol ${m.name} in class`} aria-label={`Enrol ${m.name} in class`} data-hint="Enrol in class" disabled={!!m.archived||!!family.archived} onClick={()=>onEnrol(m.id)}><GraduationCap size={17}/></button>
                {m.archived?
                  <button type="button" className="reg-card-icon" title={`Restore student: ${m.name}`} aria-label={`Restore student ${m.name}`} data-hint="Restore student" onClick={()=>onRestoreStudent(m)}><RotateCcw size={16}/></button>:
                  <button type="button" className="reg-card-icon reg-card-icon-danger" title={`Archive student: ${m.name}`} aria-label={`Archive student ${m.name}`} data-hint="Archive student" onClick={()=>onArchiveStudent(m)}><Archive size={16}/></button>}
              </div>
            </div>
            <StudentCardBadges archived={!!m.archived} activeEnrolmentCount={activeEnrolments.length} enrolmentStatus={enrolmentStatus}/>
            {!!names.length&&<div className="reg-card-class-list">{names.map(name=><span key={name} className="reg-class-chip"><GraduationCap size={13}/>{name}</span>)}</div>}
          </article>;
        })}{!children.length&&<NoResults title="No students in this family" detail="Use Add student to register the first learner."/>}</div>
      </section>
    </div>
  </>;
}
function UpdateFamily({family,onClose,onSave}:any) {
  const [parentName,setParentName]=useState(family.parentName||'');
  const [phone,setPhone]=useState(family.phone||'');
  const [location,setLocation]=useState(family.location||'');
  const [error,setError]=useState('');
  const submit=(e:any)=>{
    e.preventDefault();
    const name=clean(parentName);
    const normalizedPhone=phone.replace(/[\s-]/g,'');
    if(!name){setError('Enter the parent / guardian name.');return;}
    if(!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)){
      setError('Enter a valid international WhatsApp number.');return;
    }
    const changes:any={};
    if(name!==family.parentName)changes.parentName=name;
    if(normalizedPhone!==family.phone)changes.phone=normalizedPhone;
    if(clean(location)!==(family.location||''))changes.location=clean(location);
    if(!Object.keys(changes).length){setError('No changes to save.');return;}
    setError('');onSave(changes);
  };
  return <Modal title="Update family" subtitle="Edit guardian name, WhatsApp and location together. To edit linked student details, open their profile." onClose={onClose}>
    <form className="reg-form" onSubmit={submit}>
      <Field label="Parent / guardian name *"><input autoFocus required maxLength={90} value={parentName} onChange={e=>setParentName(e.target.value)}/></Field>
      <PhoneField label="Parent / guardian WhatsApp" value={phone} onChange={setPhone}/>
      <Field label="Town / City"><input maxLength={120} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Middlesbrough"/></Field>
      <p className="reg-footnote">Changes are saved to the shared family record in DynamoDB.</p>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary">Save changes</button></div>
    </form>
  </Modal>;
}
function ConvertToFamily({student,onClose,onSave}:any) {
  const [parentName,setParentName]=useState(student.name||'');
  const [phone,setPhone]=useState(student.phone||'');
  const [location,setLocation]=useState(student.location||'');
  const [error,setError]=useState('');
  return <Modal title="Convert individual to family" subtitle={`Keep roll number ${studentLabel(student)}, classes and learning history. Allocate a new Family ID.`} onClose={onClose}>
    <form className="reg-form" onSubmit={e=>{e.preventDefault();const normalized=phone.replace(/[\s-]/g,'');if(!clean(parentName)||!/^\+[1-9]\d{7,14}$/.test(normalized))return setError('Enter a guardian name and valid international WhatsApp number.');onSave({parentName:clean(parentName),phone:normalized,location:clean(location),existingStudentId:student.id});}}>
      <Field label="Parent / guardian name *"><input required maxLength={90} value={parentName} onChange={e=>setParentName(e.target.value)}/></Field>
      <PhoneField label="Family WhatsApp" value={phone} onChange={setPhone}/>
      <Field label="Town / City"><input maxLength={120} value={location} onChange={e=>setLocation(e.target.value)}/></Field>
      <div className="reg-info"><ShieldCheck size={16}/><span>Your student roll number remains {studentLabel(student)}. Family creation and linking are performed together in DynamoDB. Add children from the new family profile afterward.</span></div>
      {error&&<p role="alert" className="reg-error">{error}</p>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Cancel</button><button type="submit" className="reg-primary">Create family & link student</button></div>
    </form>
  </Modal>;
}

function ChangeStudentPhone({ student, onClose, onSave }: any) {
  const [value,setValue]=useState(student?.phone || '');
  const [error,setError]=useState('');
  return <Modal title="Student WhatsApp contact" subtitle={`Optional personal number for ${student?.name}. Parent contact remains unchanged.`} onClose={onClose}>
    <form className="reg-form" onSubmit={e=>{e.preventDefault();const phone=value.replace(/[\s-]/g,'');if(phone && !/^\+[1-9]\d{7,14}$/.test(phone))return setError('Use international format, or leave blank to use the parent number.');onSave(phone);}}>
      <PhoneField label="Student mobile" value={value} onChange={setValue} optional hint="Leave blank to use the family contact."/>
      <div className="reg-info"><Info size={17}/><span>Setting a mobile number does not activate WhatsApp reminders or grant permission. Consent and contact authorisation are handled later.</span></div>
      {error&&<p className="reg-error" role="alert">{error}</p>}
      <div className="reg-modal-actions"><button className="reg-secondary" type="button" onClick={onClose}>Cancel</button><button className="reg-primary" type="submit">Save student contact</button></div>
    </form>
  </Modal>;
}

function StudentRecord({ person, family, enrollments, workspace, classes, onBack, onEnrol, onEditMobile, onEditName, onConvert, onRemove, onRestore, onEditEnrol, practiceLogs=[] }: any) {
  const [tab,setTab]=useState('Overview');
  const list=enrollments.filter(e=>e.studentId===person.id && e.institution===workspace);
  const period=lastFourWeeks();
  const calculated=reportForStudent(person.id,workspace,period.from,period.to,enrollments,classes,practiceLogs);
  const activeEnrolments=list.filter(e=>getEnrolmentStatus(e)==='Active');
  const upcomingEnrolments=list.filter(e=>getEnrolmentStatus(e)==='Upcoming');
  return <>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Students</button>
    <div className="reg-page-header"><div><p className="reg-kicker">{institutions[workspace].name.toUpperCase()} · STUDENT PROFILE</p><h1>{person.name}</h1><p>Roll No. {studentLabel(person)} · {institutions[workspace].name} enrolments</p></div><div className="reg-actions"><button className="reg-primary" onClick={()=>onEnrol(person.id)}><Plus size={16}/> Enrol in class</button><button className="reg-secondary" onClick={onEditName}><Pencil size={15}/> Update</button>{!family&&<button className="reg-secondary" onClick={onConvert}><UsersRound size={15}/> Convert to family</button>}{person.archived?<button className="reg-secondary" onClick={onRestore}><RotateCcw size={15}/> Restore student</button>:<button className="reg-danger" onClick={onRemove}><Trash2 size={15}/> Remove student</button>}</div></div>
    <section className="surface reg-section"><div className="reg-tabs">{['Overview','Classes','Practice','Attendance','Notes'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</div>
      {tab==='Overview'&&<div className="reg-two-inner"><div><h2>Student information</h2><div className="reg-info-row"><span>Student ID</span><strong>{studentLabel(person)}</strong></div><div className="reg-info-row"><span>Classification</span><strong>{relationshipLabel(person)}</strong></div><div className="reg-info-row"><span>Family ID</span><strong>{family ? familyLabel(family) : "000 · Independent learner"}</strong></div><div className="reg-info-row"><span>Parent / guardian</span><strong>{family?.parentName || "Independent Student"}</strong></div><div className="reg-info-row"><span>Location</span><strong>{person.location||family?.location||'—'}</strong></div><div className="reg-info-row"><span>Contact</span><strong>{family ? maskPhone(family.phone) : maskPhone(person.phone)}</strong></div><div className="reg-info-row"><span>Student WhatsApp</span><strong>{person.phone ? maskPhone(person.phone) : family ? "Uses parent’s number" : "Not recorded"}</strong></div><div className="reg-info-row"><span>Current classes</span><strong>{new Set(activeEnrolments.map(e=>e.classId)).size}</strong></div><div className="reg-info-row"><span>Upcoming classes</span><strong>{new Set(upcomingEnrolments.map(e=>e.classId)).size}</strong></div></div><div className="reg-feature"><h3>Practice snapshot</h3><div className="reg-metrics"><div><strong>{calculated.practiceRate==null?'No data':`${calculated.practiceRate}%`}</strong><span>Practice Rate</span></div><div><strong>{calculated.submissionRate==null?'No data':`${calculated.submissionRate}%`}</strong><span>Submission Rate</span></div></div><small>Calculated only from records entered in this browser session; live practice history is not connected yet.</small></div></div>}
      {tab==='Classes'&&<><h2>Class enrolments</h2><div className="reg-stack">{list.length?list.map(e=>{const c=classes.find(c=>c.id===e.classId);return <div className="reg-enrol-row" key={e.id}><GraduationCap size={19}/><div><strong>{c?.name}</strong><small>{fmtDate(e.startDate)} {e.endDate?`– ${fmtDate(e.endDate)}`:''} · {e.id}</small></div><Status status={getEnrolmentStatus(e)}/><button className="reg-secondary" onClick={()=>onEditEnrol(e)}>Edit dates</button></div>}):<NoResults title="No enrolment yet" detail="Use Enrol in class to create a record."/>}</div></>}
      {tab==='Practice'&&<><h2>Practice records (last four weeks)</h2><div className="reg-metrics"><div><strong>{calculated.practiceRate==null?'No data':calculated.practiceRate+'%'}</strong><span>Practice Rate</span></div><div><strong>{calculated.submissionRate==null?'No data':calculated.submissionRate+'%'}</strong><span>Submission Rate</span></div><div><strong>{calculated.minutes} min</strong><span>Total minutes</span></div></div><p className="reg-muted">Record or correct practice from Practice & Reports. Voided records do not contribute to totals.</p><div className="reg-stack">{practiceLogs.filter(l=>l.studentId===person.id&&l.institution===workspace&&l.date>=period.from&&l.date<=period.to).sort((a,b)=>b.date.localeCompare(a.date)).map(l=><div className="reg-enrol-row" key={l.id}><CalendarDays size={16}/><div><strong>{l.date}: {l.didPractice?'Yes':'No'} · {l.minutes} min</strong><small>{l.comments||'No comment'} · {l.status}</small></div></div>)}</div></>}
      {tab==='Attendance'&&<><h2>Attendance RSVPs</h2><p className="reg-muted">Session RSVP information will be connected in the attendance phase.</p></>}
      {tab==='Notes'&&<><h2>Internal teacher notes</h2><p className="reg-muted">Protected institutional notes remain separate and are not included in report exports.</p><NoResults title="No teacher notes" detail="Teacher notes will appear after this feature is connected to the database."/></>}
    </section>
  </>;
}

export default function RegistrationModule({workspace, families, members, enrolments, classes, setFamilies, setMembers, setEnrolments, initialClass=null, initialStudent=null, practiceLogs=[], setPracticeLogs=()=>{}, operationsApi=null, reload=async()=>{}}: any) {
  const [area,setArea] = useState(()=>{try{return sessionStorage.getItem(`sadhana:registration:${workspace}:area`)||'students';}catch{return 'students';}});
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState(()=>{try{return sessionStorage.getItem(`sadhana:registration:${workspace}:filter`)||'All';}catch{return 'All';}});
  const [view,setView]=useState<'list'|'table'>(()=>{try{return sessionStorage.getItem(`sadhana:registration:${workspace}:view`)==='table'?'table':'list';}catch{return 'list';}});
  // v096-table-sort-marker: presentation-only controls, never modify persisted records.
  const [tableSort,setTableSort]=useState<'roll'|'name'>('roll');
  const [tableDirection,setTableDirection]=useState<'asc'|'desc'>('asc');
  const [tableLocation,setTableLocation]=useState('All');
  const changeTableSort=(column:'roll'|'name')=>{if(tableSort===column)setTableDirection(v=>v==='asc'?'desc':'asc');else{setTableSort(column);setTableDirection('asc');}};
  useEffect(()=>{try{sessionStorage.setItem(`sadhana:registration:${workspace}:area`,area);sessionStorage.setItem(`sadhana:registration:${workspace}:filter`,filter);sessionStorage.setItem(`sadhana:registration:${workspace}:view`,view);}catch{/* private mode */}},[workspace,area,filter,view]);
  const [importRows,setImportRows]=useState<any[]>([]);
  const [importErrors,setImportErrors]=useState<string[]>([]);
  const [importBusy,setImportBusy]=useState(false);
  const [familyFocus,setFamilyFocus]=useState(null);
  const [studentFocus,setStudentFocus]=useState(initialStudent);
  const [dialog,setDialog]=useState(initialClass ? 'enrol' : null);
  const [selectedStudent,setSelectedStudent]=useState('');
  const [selectedClass,setSelectedClass]=useState(initialClass || '');
  const [newEnrolStudents,setNewEnrolStudents]=useState<any[]>([]);
  const [newEnrolFamilies,setNewEnrolFamilies]=useState<any[]>([]);
  const [flash,setFlash]=useState('');
  const [writeError,setWriteError]=useState('');
  const [writing,setWriting]=useState(false);
  const persist=async(work:()=>Promise<any>, success:string, after?:()=>void)=>{if(writing)return;setWriting(true);setWriteError('');try{await work();await reload();after?.();setDialog(null);setFlash(success);}catch(e){setWriteError(e instanceof Error?e.message:'Could not save to DynamoDB.');}finally{setWriting(false);}};
  const [editEnrol,setEditEnrol]=useState(null);
  const scoped = useMemo(()=>enrolments.filter(e=>e.institution===workspace),[enrolments,workspace]);
  const scopedIds = new Set(scoped.map(e=>e.studentId));
  const studentsInWorkspace = members.filter(m=>scopedIds.has(m.id) || m.createdIn===workspace);
  const studentStatus=(m:any)=>{const statuses=scoped.filter(e=>e.studentId===m.id).map(getEnrolmentStatus);return m.archived?'Archived':statuses.includes('Active')?'Active':statuses.includes('Upcoming')?'Upcoming':statuses.includes('Archived')?'Archived':'Registered';};
  const familyStatus=(f:any)=>{if(f.archived)return 'Archived';const children=members.filter(m=>m.familyId===f.id);const statuses=children.map(studentStatus);return statuses.includes('Active')?'Active':statuses.includes('Upcoming')?'Upcoming':statuses.includes('Registered')?'Registered':statuses.includes('Archived')?'Archived':'Registered';};
  const classNames=(m:any)=>[...new Set(scoped.filter(e=>e.studentId===m.id && !e.archived).map(e=>classes.find(c=>c.id===e.classId)?.name).filter(Boolean))];
  const locationFor=(m:any)=>m.location||families.find(f=>f.id===m.familyId)?.location||'—';
  const contactFor=(m:any)=>m.phone||families.find(f=>f.id===m.familyId)?.phone||'';
  const exportCSV=()=>{
    const header=area!=='families'?['Roll No.','Student','Location','Classes','Status','Family ID','Guardian','Contact Phone']:['Family ID','Parent / Guardian','Location','Students','Status','WhatsApp'];
    const rows=area!=='families'?visibleStudents.map(m=>{const f=families.find(f=>f.id===m.familyId);return [studentLabel(m),m.name,locationFor(m),classNames(m).join('; '),studentStatus(m),f?familyLabel(f):'',f?.parentName||'',contactFor(m)];}):visibleFamilies.map(f=>[familyLabel(f),f.parentName,f.location||'',members.filter(m=>m.familyId===f.id).length,familyStatus(f),f.phone||'']);
    const csv=[header,...rows].map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`sadhana-${area}-${workspace}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const parseCSV=(raw:string)=>{const rows:string[][]=[];let row:string[]=[],field='',quote=false;for(let i=0;i<raw.length;i++){const c=raw[i];if(quote){if(c==='"'&&raw[i+1]==='"'){field+='"';i++;}else if(c==='"')quote=false;else field+=c;}else if(c==='"')quote=true;else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}if(quote)throw Error('Unclosed quote in CSV.');if(field||row.length){row.push(field);rows.push(row);}return rows.filter(r=>r.some(c=>c.trim()));};
  const importCSV=async(file:File)=>{setImportRows([]);setImportErrors([]);try{if(file.size>250000)throw Error('CSV too large (max 250 KB).');const lines=parseCSV((await file.text()).replace(/^\uFEFF/,''));const headers=(lines.shift()||[]).map(x=>x.trim().toLowerCase());const required=['student','location','student whatsapp','family id','parent / guardian','parent whatsapp','independent student'];if(required.some(h=>!headers.includes(h)))throw Error('Use the import template; the required column headings do not match.');if(!lines.length)throw Error('CSV contains no student rows.');if(lines.length>100)throw Error('Import up to 100 students per file.');const parsed=lines.map((row,i)=>{const get=(h:string)=>clean(row[headers.indexOf(h)]||'');return {line:i+2,name:get('student'),location:get('location'),phone:get('student whatsapp').replace(/[\s-]/g,''),familyNumber:get('family id'),parentName:get('parent / guardian'),parentPhone:get('parent whatsapp').replace(/[\s-]/g,''),adultConfirmed:get('independent student').toLowerCase()==='yes'};});const errors:string[]=[];const names=new Set<string>();parsed.forEach(r=>{const id=`${r.name.toLowerCase()}|${r.familyNumber||r.parentName.toLowerCase()}`;if(!r.name)errors.push(`Line ${r.line}: student name required`);if(names.has(id)||members.some(m=>m.name.toLowerCase()===r.name.toLowerCase()&&(r.familyNumber?families.some(f=>f.id===m.familyId&&familyLabel(f)===r.familyNumber):!m.familyId)))errors.push(`Line ${r.line}: potential duplicate student`);names.add(id);if(r.phone&&!/^\+[1-9]\d{7,14}$/.test(r.phone))errors.push(`Line ${r.line}: invalid student WhatsApp`);if(!r.familyNumber&&!r.parentName&&!r.adultConfirmed)errors.push(`Line ${r.line}: independent student must say Yes`);if(r.parentName&&!/^\+[1-9]\d{7,14}$/.test(r.parentPhone))errors.push(`Line ${r.line}: parent WhatsApp required`);if(r.familyNumber&&!families.some(f=>familyLabel(f)===r.familyNumber))errors.push(`Line ${r.line}: family number not found`);});setImportRows(parsed);setImportErrors(errors);}catch(e){setImportErrors([e instanceof Error?e.message:'Unable to read CSV.']);}};
  const confirmImport=async()=>{if(importBusy||importErrors.length||!importRows.length)return;setImportBusy(true);setWriteError('');try{const created=new Map<string,string>();for(const r of importRows){let familyId='';if(r.familyNumber){familyId=families.find(f=>familyLabel(f)===r.familyNumber)?.id||'';}else if(r.parentName){const key=`${r.parentName.toLowerCase()}|${r.parentPhone}`;familyId=created.get(key)||'';if(!familyId){const existing=families.find(f=>f.parentName.toLowerCase()===r.parentName.toLowerCase()&&f.phone===r.parentPhone);if(existing)familyId=existing.id;else{const result=await operationsApi.createOperation('family',workspace,{parentName:r.parentName,phone:r.parentPhone,location:r.location});familyId=result.record.id;}created.set(key,familyId);}}await operationsApi.createOperation('student',workspace,{name:r.name,phone:r.phone,location:familyId?'':r.location,familyId,adultConfirmed:!familyId&&r.adultConfirmed});}await reload();setImportRows([]);setDialog(null);setFlash('CSV students imported and saved to DynamoDB.');}catch(e){setWriteError(`Import stopped: ${e instanceof Error?e.message:'DynamoDB error'}. Earlier rows may have been saved. Refresh and review before retrying.`);await reload();setDialog(null);}finally{setImportBusy(false);}};
  const downloadTemplate=()=>{const csv='Student,Location,Student WhatsApp,Family ID,Parent / Guardian,Parent WhatsApp,Independent Adult\r\n"Example Child","Newcastle","","","Example Parent","+447700900123","No"\r\n';const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.href=url;a.download='sadhana-student-import-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const visibleStudents = studentsInWorkspace.filter(m=>{
    if(area==='individuals'&&m.familyId)return false;
    const matches=clean(`${m.name} ${m.id} ${studentLabel(m)} ${locationFor(m)} ${families.find(f=>f.id===m.familyId)?.parentName}`).toLowerCase().includes(query.toLowerCase());
    const statuses=scoped.filter(e=>e.studentId===m.id).map(getEnrolmentStatus);
    const status=studentStatus(m);
    return matches && (filter==='All'||filter===status);
  });
  const tableLocations=Array.from(new Set<string>(studentsInWorkspace.filter(m=>area!=='individuals'||!m.familyId).map(m=>String(locationFor(m)||'').trim()).filter(v=>v&&v!=='—'))).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  const tableStudents=sortDirectoryStudents(filterStudentsByLocation(visibleStudents,tableLocation,locationFor),tableSort,tableDirection,studentLabel);
  const familyLocations=Array.from(new Set<string>(families.filter(f=>f.createdIn===workspace || members.some(m=>m.familyId===f.id && scopedIds.has(m.id))).map(f=>String(f.location||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  const visibleFamilies=families.filter(f=>f.createdIn===workspace || members.some(m=>m.familyId===f.id && scopedIds.has(m.id))).filter(f=>(tableLocation==='All'||String(f.location||'').trim().toLocaleLowerCase()===tableLocation.toLocaleLowerCase()) && `${f.parentName} ${f.location||''} ${f.id} ${familyLabel(f)} ${members.filter(m=>m.familyId===f.id).map(m=>m.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()) && (filter==='All'||familyStatus(f)===filter));
  const openEnrol=(studentId='',classId='')=>{setNewEnrolStudents([]);setNewEnrolFamilies([]);setSelectedStudent(studentId);setSelectedClass(classId);setDialog(studentId||classId?'enrol':'enrol-route');};
  const createAndEnrol=async(kind:'family'|'student',values:any)=>{
    if(writing)return;setWriting(true);setWriteError('');
    try{
      const response=await operationsApi.createOperation(kind,workspace,kind==='family'?values:{name:values.name,phone:values.phone,location:values.location,familyId:'',adultConfirmed:true});
      const created=kind==='family'?(response.students||[]):[response.record];
      if(!created.length)throw Error('Registration saved, but no learner was returned. Refresh the directory before enrolling.');
      setNewEnrolStudents(created.map((r:any)=>({...r,createdIn:workspace})));
      setNewEnrolFamilies(kind==='family'?[response.record]:[]);
      setSelectedStudent(created.length===1?created[0].id:'');
      // Keep this modal mounted until class enrolment finishes; reload on completion/cancel.
      setDialog('enrol');
      setFlash('Registration saved. Select the learner and class to complete enrolment.');
    }catch(e){setWriteError(e instanceof Error?e.message:'Could not register student.');}
    finally{setWriting(false);}
  };
  const register=(values:any)=>void persist(async()=>{
    await operationsApi.createOperation('family',workspace,values);
  },'Family and all selected learners saved together to DynamoDB.',()=>{setArea('families');setQuery('');setFamilyFocus(null);});
  const registerIndependent=(values:any)=>void persist(async()=>{
    await operationsApi.createOperation('student',workspace,{name:values.name,phone:values.phone,location:values.location,familyId:'',adultConfirmed:true});
  },'Independent Student saved to DynamoDB.',()=>{setArea('students');setQuery('');setStudentFocus(null);});
  const addChild=(values:any)=>void persist(async()=>{
    await operationsApi.createOperation('student',workspace,{name:values.name,phone:values.phone||'',familyId:familyFocus,relationship:'child'});
  },'Student added to family in DynamoDB.');
  const saveEnrol=(values:any)=>void persist(async()=>{
    await operationsApi.createOperation('enrolment',workspace,{studentId:values.studentId,classId:values.classId,startDate:values.startDate,endDate:''});
  },'Enrolment saved to DynamoDB.',()=>{setStudentFocus(values.studentId);setFamilyFocus(null);setArea('students');setQuery('');setFilter('All');});
  const updateRecord=(kind:'family'|'student'|'enrolment', record:any,changes:any,message:string)=>void persist(async()=>{
    await operationsApi.updateOperation(kind,workspace,record.id,changes,record.version);
  },message);
  const convertIndividual=(values:any)=>void persist(async()=>{await operationsApi.createOperation('family',workspace,values);},'Family created and existing student linked. Original roll number and enrolments retained.',()=>{setStudentFocus(null);setArea('families');setQuery('');setFilter('All');});
  const [archiveTarget,setArchiveTarget]=useState<any>(null);
  const confirmArchive=()=>{if(!archiveTarget)return;const {kind,record,restore}=archiveTarget;
    setArchiveTarget(null);
    void persist(async()=>{ await persistArchiveState(operationsApi.updateOperation,kind,workspace,record,restore); },restore?'Record restored in DynamoDB.':'Record archived in DynamoDB; IDs and history preserved.');
  };
  const [phoneForStudent,setPhoneForStudent]=useState('');
  const family=families.find(f=>f.id===familyFocus);
  const person=members.find(m=>m.id===studentFocus);
  return <div className="reg-module">
    {flash && <div className="reg-success" role="status"><CheckCircle2 size={17}/><span>{flash}</span><button aria-label="Dismiss" onClick={()=>setFlash('')}><X size={15}/></button></div>}
    {writeError&&<p role="alert" className="reg-error">{writeError}</p>}
    {writing&&<p role="status" className="reg-footnote">Saving to DynamoDB…</p>}
    {family ? <FamilyDetail family={family} members={members} enrolments={enrolments} workspace={workspace} onBack={()=>setFamilyFocus(null)} onAddChild={()=>setDialog('child')} onEnrol={id=>openEnrol(id)} classes={classes} onUpdate={()=>setDialog('update-family')} onOpenStudent={id=>{setFamilyFocus(null);setStudentFocus(id);}} onArchive={()=>setArchiveTarget({kind:'family',record:family,restore:false})} onRestore={()=>setArchiveTarget({kind:'family',record:family,restore:true})} onArchiveStudent={student=>setArchiveTarget({kind:'student',record:student,restore:false})} onRestoreStudent={student=>setArchiveTarget({kind:'student',record:student,restore:true})}/> : person ? <StudentRecord key={`${workspace}-${person.id}`} person={person} family={families.find(f=>f.id===person.familyId)} enrollments={enrolments} workspace={workspace} onBack={()=>setStudentFocus(null)} onEnrol={id=>openEnrol(id)} classes={classes} onEditMobile={id=>{setPhoneForStudent(id);setDialog('student-phone');}} onEditName={()=>setDialog('student-name')} onConvert={()=>setDialog('convert-family')} onRemove={()=>setArchiveTarget({kind:'student',record:person,restore:false})} onRestore={()=>setArchiveTarget({kind:'student',record:person,restore:true})} onEditEnrol={e=>{setEditEnrol(e);setDialog('edit-enrol');}} practiceLogs={practiceLogs}/> : <>
      <div className="reg-page-header"><div><p className="reg-kicker">FAMILY & STUDENT MANAGEMENT</p><h1>Families & Students</h1><p>Manage shared family identities and {institutions[workspace].name} student enrolments.</p></div></div>
      <section className="surface reg-section">
        <div className="reg-toolbar" style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <div className="reg-tabs"><button className={area==='students'?'active':''} onClick={()=>{setArea('students');setQuery('');setFilter('All');setTableLocation('All');}}>Students</button><button className={area==='families'?'active':''} onClick={()=>{setArea('families');setQuery('');setFilter('All');setTableLocation('All');}}>Families</button><button className={area==='individuals'?'active':''} onClick={()=>{setArea('individuals');setQuery('');setFilter('All');setTableLocation('All');}}>Individuals</button></div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginLeft:'auto'}}>
            <div className="reg-search"><Search size={17}/><input aria-label="Search family or student" placeholder={area==='families'?'Search families…':area==='individuals'?'Search individuals…':'Search students…'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
            <select aria-label="Filter by status" className="reg-secondary" value={filter} onChange={e=>setFilter(e.target.value)} style={{minHeight:42}}>{['All','Active','Upcoming','Registered','Archived'].map(v=><option key={v} value={v}>{v==='All'?'All statuses':v}</option>)}</select>
            {(view==='table'||area==='families')&&<select id="reg-table-location" className="reg-secondary" aria-label={area==='families'?"Filter families by location":"Filter students by location"} value={tableLocation} onChange={e=>setTableLocation(e.target.value)} style={{minHeight:42,maxWidth:200}}><option value="All">All locations</option>{(area==='families'?familyLocations:tableLocations).map(loc=><option key={loc} value={loc}>{loc}</option>)}</select>}
            <DirectoryDataMenu onImport={()=>{setImportRows([]);setImportErrors([]);setDialog('import-csv');}} onExport={()=>exportCSV()}/>
          </div>
        </div>
        <div className="reg-filter-line" style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',padding:'18px 0 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}} role="group" aria-label="Directory view">
            <button type="button" className={view==='list'?'current':''} aria-pressed={view==='list'} onClick={()=>setView('list')}><List size={15}/> List</button>
            <button type="button" className={view==='table'?'current':''} aria-pressed={view==='table'} onClick={()=>setView('table')}><Table2 size={15}/> Table</button>
          </div>
          <div className="reg-actions" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginLeft:'auto'}}>
            {area!=='families'&&<button type="button" className="reg-secondary" onClick={()=>openEnrol()}><GraduationCap size={16}/> Enrol student</button>}
            <button type="button" className="reg-primary" onClick={()=>setDialog(area==='individuals'?'independent':'family')}><Plus size={16}/>{area==='individuals'?'Register individual':'Register family'}</button>
          </div>
        </div>
        {view==='table'&&area!=='families'&&<p className="reg-table-result-count" role="status">{tableStudents.length} student{tableStudents.length===1?'':'s'} shown</p>}
        {view==='table' ? <div style={{overflowX:'auto'}}><table className="reg-directory-table" style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr>{(area!=='families'?['Roll No.','Student','Location','Phone','Classes','Status']:['Family ID','Parent / Guardian','Location','Phone','Students','Status']).map(h=><th key={h} scope="col" aria-sort={area!=='families'&&((h==='Roll No.'&&tableSort==='roll')||(h==='Student'&&tableSort==='name'))?(tableDirection==='asc'?'ascending':'descending'):undefined} style={{padding:'13px 12px',borderBottom:'1px solid #e4e9f1'}}>{area!=='families'&&(h==='Roll No.'||h==='Student')?<button type="button" onClick={()=>changeTableSort(h==='Roll No.'?'roll':'name')} aria-label={`Sort by ${h==='Roll No.'?'roll number':'student name'}${(h==='Roll No.'&&tableSort==='roll')||(h==='Student'&&tableSort==='name')?', currently '+(tableDirection==='asc'?'ascending':'descending'):''}`} style={{border:0,background:'transparent',color:'inherit',font:'inherit',fontWeight:700,cursor:'pointer',padding:0,display:'inline-flex',gap:6,alignItems:'center'}}>{h}<span aria-hidden="true">{(h==='Roll No.'&&tableSort==='roll')||(h==='Student'&&tableSort==='name')?(tableDirection==='asc'?'▲':'▼'):'↕'}</span></button>:h}</th>)}</tr></thead><tbody>{area!=='families'?tableStudents.map(m=><tr key={m.id} onClick={()=>setStudentFocus(m.id)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setStudentFocus(m.id);}} style={{cursor:'pointer',borderBottom:'1px solid #edf0f5'}}><td style={{padding:12}}>{studentLabel(m)}</td><td style={{padding:12}}><strong>{m.name}</strong></td><td style={{padding:12}}>{locationFor(m)}</td><td style={{padding:12,whiteSpace:'nowrap'}}>{contactFor(m)||'—'}</td><td style={{padding:12}}>{classNames(m).join(', ')||'—'}</td><td style={{padding:12}}><Status status={studentStatus(m)}/></td></tr>):visibleFamilies.map(f=><tr key={f.id} onClick={()=>setFamilyFocus(f.id)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setFamilyFocus(f.id);}} style={{cursor:'pointer',borderBottom:'1px solid #edf0f5'}}><td style={{padding:12}}>{familyLabel(f)}</td><td style={{padding:12}}><strong>{f.parentName}</strong></td><td style={{padding:12}}>{f.location||'—'}</td><td style={{padding:12,whiteSpace:'nowrap'}}>{f.phone||'—'}</td><td style={{padding:12}}>{members.filter(m=>m.familyId===f.id).length}</td><td style={{padding:12}}><Status status={familyStatus(f)}/></td></tr>)}</tbody></table></div>
        : area==='families'? <div className="reg-stack">{visibleFamilies.map(f=><button key={f.id} className="reg-entry" onClick={()=>setFamilyFocus(f.id)}><span className="reg-icon"><UsersRound size={19}/></span><div className="reg-entry-main"><strong>{f.parentName}</strong><small>Family {familyLabel(f)} · {f.location||'Location not set'} · {members.filter(m=>m.familyId===f.id).length} student(s) · {f.phone||'No phone'}</small></div><Status status={familyStatus(f)}/><ChevronRight size={18}/></button>)}{!visibleFamilies.length&&<NoResults title="No families found" detail="Register a family to create parent and student records."/>}</div>
        : <div className="reg-stack">{visibleStudents.map(m=>{const family=families.find(f=>f.id===m.familyId);return <div className="reg-entry reg-directory-student-entry" key={m.id} role="button" tabIndex={0} aria-label={`Open student profile: ${m.name}`} onClick={()=>setStudentFocus(m.id)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setStudentFocus(m.id);}}}><StudentAvatar name={m.name}/><div className="reg-entry-main"><strong>{m.name}</strong><small>{studentLabel(m)} · {locationFor(m)} · {contactFor(m)||'No phone'} · {classNames(m).join(', ')||'No class'} · {family?.parentName||'Independent learner'}</small></div><div className="reg-directory-student-trailing"><Status status={studentStatus(m)}/><div className="reg-card-icon-actions reg-directory-student-actions" role="group" aria-label={`Actions for ${m.name}`} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}><button type="button" className="reg-card-icon" title={`Edit profile: ${m.name}`} aria-label={`Edit profile for ${m.name}`} data-hint="Edit profile" onClick={()=>{setStudentFocus(m.id);setDialog('student-name');}}><Pencil size={17}/></button><button type="button" className="reg-card-icon" title={`Enrol in class: ${m.name}`} aria-label={`Enrol ${m.name} in class`} data-hint="Enrol in class" disabled={!!m.archived} onClick={()=>openEnrol(m.id)}><GraduationCap size={17}/></button><button type="button" className={`reg-card-icon${m.archived?'':' reg-card-icon-danger'}`} title={`${m.archived?'Restore':'Archive'} student: ${m.name}`} aria-label={`${m.archived?'Restore':'Archive'} student ${m.name}`} data-hint={m.archived?'Restore student':'Archive student'} onClick={()=>setArchiveTarget({kind:'student',record:m,restore:!!m.archived})}>{m.archived?<RotateCcw size={17}/>:<Archive size={17}/>}</button></div></div><ChevronRight className="reg-directory-chevron" size={18}/></div>})}{!visibleStudents.length&&<NoResults title="No matching students" detail="Register a student or change the filter."/>}</div>}
        <p className="reg-footnote"><Info size={15}/> Records are saved to DynamoDB for this academy. Family and student IDs are shared across academies; class enrolments remain academy-specific.</p>
      </section>
    </>}
    {dialog==='import-csv'&&<Modal title="Import students from CSV" subtitle="Preview and validate before saving to DynamoDB. Roll numbers are allocated automatically." onClose={()=>{if(!importBusy)setDialog(null);}}><div className="reg-form">
      <p className="reg-muted">Use the template. For an existing family, enter its short Family ID. For a new family, enter parent name and WhatsApp. For an independent student, set Independent Adult to Yes.</p>
      <button type="button" className="reg-secondary" onClick={downloadTemplate}><Download size={16}/> Download import template</button>
      <Field label="Choose CSV file"><input type="file" accept=".csv,text/csv" disabled={importBusy} onChange={e=>{const f=e.target.files?.[0];if(f)void importCSV(f);}}/></Field>
      {importErrors.map((msg,i)=><p className="reg-error" key={i}>{msg}</p>)}
      {!!importRows.length&&<><p><strong>{importRows.length} students ready for review</strong></p><div style={{maxHeight:240,overflow:'auto'}}><table style={{width:'100%'}}><thead><tr><th>Student</th><th>Location</th><th>Family</th></tr></thead><tbody>{importRows.map(r=><tr key={r.line}><td>{r.name}</td><td>{r.location||'—'}</td><td>{r.familyNumber||r.parentName||'Independent'}</td></tr>)}</tbody></table></div><p className="reg-warning">Import is not atomic: if a network failure occurs, some rows may already be saved. Review the directory before retrying.</p></>}
      <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={()=>setDialog(null)} disabled={importBusy}>Cancel</button><button type="button" className="reg-primary" disabled={importBusy||!!importErrors.length||!importRows.length} onClick={()=>void confirmImport()}>{importBusy?'Importing…':`Confirm import (${importRows.length})`}</button></div>
    </div></Modal>}
    {dialog==='enrol-route'&&<Modal title="Enrol student" subtitle="Choose the right path for this learner. You can enrol a new or existing student." onClose={()=>setDialog(null)}>
      <div className="reg-wizard-body">
        <div className="reg-wizard-progress"><span className="reg-wizard-progress-active">1 · Student</span><span>2 · Registration</span><span>3 · Class</span></div>
        <div className="reg-wizard-eyebrow">STEP 1 OF 3</div>
        <h3 className="reg-wizard-question">Is the student already registered?</h3>
        <p className="reg-wizard-explain">Select an existing record to avoid duplicates, or register someone new before choosing their class.</p>
        <div className="reg-wizard-options">
          <button type="button" className="reg-wizard-option" onClick={()=>setDialog('enrol')}><span className="reg-wizard-option-icon"><Search size={22}/></span><span className="reg-wizard-option-copy"><strong>Existing student</strong><small>Find a learner by name or roll number</small></span><ArrowRight size={19}/></button>
          <button type="button" className="reg-wizard-option" onClick={()=>setDialog('enrol-new-type')}><span className="reg-wizard-option-icon"><Plus size={22}/></span><span className="reg-wizard-option-copy"><strong>New student</strong><small>Register a learner, then enrol them in a class</small></span><ArrowRight size={19}/></button>
        </div>
        <div className="reg-wizard-tip"><Info size={17}/><span>Existing students keep their permanent roll number and enrolment history.</span></div>
        <div className="reg-wizard-footer"><button type="button" className="reg-secondary" onClick={()=>setDialog(null)}>Cancel</button></div>
      </div>
    </Modal>}
    {dialog==='enrol-new-type'&&<Modal title="Register new student" subtitle="Choose how the learner belongs in Sadhana before selecting a class." onClose={()=>setDialog(null)}>
      <div className="reg-wizard-body">
        <div className="reg-wizard-progress"><span className="reg-wizard-progress-done">1 · Student</span><span className="reg-wizard-progress-active">2 · Registration</span><span>3 · Class</span></div>
        <div className="reg-wizard-eyebrow">STEP 2 OF 3</div>
        <h3 className="reg-wizard-question">How should we register this student?</h3>
        <p className="reg-wizard-explain">Each learner gets a unique roll number. Families can register multiple learners together.</p>
        <div className="reg-wizard-options">
          <button type="button" className="reg-wizard-option" onClick={()=>setDialog('enrol-new-individual')}><span className="reg-wizard-option-icon"><GraduationCap size={22}/></span><span className="reg-wizard-option-copy"><strong>Independent Student</strong><small>A learner without a family record</small></span><ArrowRight size={19}/></button>
          <button type="button" className="reg-wizard-option" onClick={()=>setDialog('enrol-new-family')}><span className="reg-wizard-option-icon"><UsersRound size={22}/></span><span className="reg-wizard-option-copy"><strong>Family registration</strong><small>Add a parent or guardian and one or more learners</small></span><ArrowRight size={19}/></button>
        </div>
        <div className="reg-wizard-footer"><button type="button" className="reg-secondary" onClick={()=>setDialog('enrol-route')}><ArrowLeft size={16}/> Back</button></div>
      </div>
    </Modal>}
    {dialog==='enrol-new-individual'&&<RegisterIndependent onClose={()=>setDialog('enrol-new-type')} onSave={v=>void createAndEnrol('student',v)}/>}
    {dialog==='enrol-new-family'&&<RegisterFamily onClose={()=>setDialog('enrol-new-type')} onSave={v=>void createAndEnrol('family',v)}/>}
    {archiveTarget&&<Modal title={`${archiveTarget.restore?'Restore':'Archive'} ${archiveTarget.kind}`} subtitle="Protected identity status change" onClose={()=>setArchiveTarget(null)}><div className="reg-form"><div className="reg-warning"><CircleAlert size={18}/><span>{archiveTarget.restore?'Restore this record to active directory use?':'Archiving preserves identifiers, enrolments and academic history. Students with active enrolments, and families with unarchived members, cannot be archived.'}</span></div><div className="reg-modal-actions"><button className="reg-secondary" onClick={()=>setArchiveTarget(null)}>Cancel</button><button className="reg-primary" onClick={confirmArchive}>{archiveTarget.restore?'Restore record':'Confirm archive'}</button></div></div></Modal>}
    {dialog==='family'&&<RegisterFamily onClose={()=>setDialog(null)} onSave={register}/>}
    {dialog==='convert-family'&&person&&!person.familyId&&<ConvertToFamily student={person} onClose={()=>setDialog(null)} onSave={convertIndividual}/>}
    {dialog==='independent'&&<RegisterIndependent onClose={()=>setDialog(null)} onSave={registerIndependent}/>}
    {dialog==='child'&&family&&<AddChild family={family} onClose={()=>setDialog(null)} onSave={addChild}/>}
    {dialog==='enrol'&&<EnrolModal classes={classes} workspace={workspace} families={[...families.filter((f:any)=>!newEnrolFamilies.some((n:any)=>n.id===f.id)),...newEnrolFamilies]} members={[...members.filter((m:any)=>!newEnrolStudents.some((n:any)=>n.id===m.id)),...newEnrolStudents]} enrolments={enrolments} presetStudent={selectedStudent} presetClass={selectedClass} onSave={saveEnrol} onClose={()=>{if(newEnrolStudents.length)void reload();setDialog(null);}}/>}
    {dialog==='student-phone'&&phoneForStudent&&<ChangeStudentPhone student={members.find(m=>m.id===phoneForStudent)} onClose={()=>setDialog(null)} onSave={phone=>updateRecord('student',members.find(m=>m.id===phoneForStudent),{phone},'Student contact saved to DynamoDB.')}/>}
    {dialog==='update-family'&&family&&<UpdateFamily family={family} onClose={()=>setDialog(null)} onSave={changes=>updateRecord('family',family,changes,'Family details saved to DynamoDB.')}/>}
    {dialog==='student-name'&&person&&<EditName kind="student" record={person} family={families.find(f=>f.id===person.familyId)} onClose={()=>setDialog(null)} onSave={changes=>updateRecord('student',person,changes,'Student details saved to DynamoDB.')}/>}
    {dialog==='edit-enrol'&&editEnrol&&<EditEnrolment entry={editEnrol} onClose={()=>setDialog(null)} onSave={v=>updateRecord('enrolment',editEnrol,v,'Enrolment dates saved to DynamoDB.')}/>}

  </div>;
}
