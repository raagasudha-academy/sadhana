import {useEffect,useMemo,useRef,useState} from 'react';
import {CheckCircle2,Plus,RefreshCw} from 'lucide-react';
import SessionAttendanceRegister from './SessionAttendanceRegister';
import TeacherWorkspace from './TeacherWorkspace';
import type {InstitutionId} from './types';
import type {CloudSession} from './CloudAuth';
import './academyOperations.css';
import {visibleMasterClasses,visibleDatedSessions,eligibleStudentIds,enrolledStudentIds} from './operationsSelectors';
type Kind='family'|'student'|'enrolment'|'attendance'|'practice'|'feedback'|'rsvp';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const empty={family:{parentName:'',phone:''},student:{name:'',phone:'',familyId:'',adultConfirmed:false},enrolment:{studentId:'',classId:'',startDate:today(),endDate:'',archived:false},attendance:{studentId:'',sessionId:'',status:'present',note:''},practice:{studentId:'',classId:'',date:today(),didPractice:true,minutes:15,comments:''},feedback:{studentId:'',classId:'',date:today(),note:''},rsvp:{studentId:'',sessionId:'',intention:'attending',note:''}};
const labels={family:'Families',student:'Students',enrolment:'Enrolments',attendance:'Attendance',practice:'Practice',feedback:'Teacher feedback',rsvp:'RSVPs'};
const fields:Record<Kind,Array<{key:string;label:string;type?:string;required?:boolean}>>={
 family:[{key:'parentName',label:'Parent / guardian',required:true},{key:'phone',label:'WhatsApp / telephone (+country code)',required:true}],
 student:[{key:'name',label:'Student name',required:true},{key:'familyId',label:'Family (optional for adults)'},{key:'phone',label:'Student telephone'}],
 enrolment:[{key:'studentId',label:'Student',required:true},{key:'classId',label:'Master class',required:true},{key:'startDate',label:'Starts',type:'date',required:true},{key:'endDate',label:'Ends (optional)',type:'date'},{key:'archived',label:'Withdraw / archive enrolment'}],
 attendance:[{key:'studentId',label:'Student',required:true},{key:'sessionId',label:'Dated session',required:true},{key:'status',label:'Attendance',required:true},{key:'note',label:'Notes'}],
 practice:[{key:'studentId',label:'Student',required:true},{key:'classId',label:'Class',required:true},{key:'date',label:'Practice date',type:'date',required:true},{key:'didPractice',label:'Practised?',required:true},{key:'minutes',label:'Minutes',type:'number',required:true},{key:'comments',label:'Comments'}],
 feedback:[{key:'studentId',label:'Student',required:true},{key:'classId',label:'Class',required:true},{key:'date',label:'Date',type:'date',required:true},{key:'note',label:'Teacher feedback',required:true}],rsvp:[{key:'studentId',label:'Student',required:true},{key:'sessionId',label:'Dated session',required:true},{key:'intention',label:'Attendance intention',required:true},{key:'note',label:'Notes'}]
};
export default function AcademyOperations({cloud,workspace,teacherMode,initialArea='student',initialStudent='',initialClass=''}:{cloud?:CloudSession;workspace:InstitutionId;teacherMode:boolean;initialArea?:Kind;initialStudent?:string;initialClass?:string}){
 const [area,setArea]=useState<Kind>(initialArea),[data,setData]=useState<Record<Kind,any[]>>({family:[],student:[],enrolment:[],attendance:[],practice:[],feedback:[],rsvp:[]});
 const [schedule,setSchedule]=useState<any[]>([]),[draft,setDraft]=useState<any>(empty[initialArea]),[edit,setEdit]=useState<any>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showForm,setShowForm]=useState(false),[search,setSearch]=useState('');
 const loadSeq=useRef(0);
 const admin=!teacherMode&&cloud?.staff.role==='admin';
 const kinds:Kind[]=admin?['student','family','enrolment','attendance','practice','feedback','rsvp']:['enrolment','attendance','practice','feedback','rsvp'];
 const reload=async()=>{
  if(!cloud)return;const seq=++loadSeq.current;setBusy(true);setError('');try{
   const wanted=admin?kinds:[...kinds,'student' as Kind];const [all,cal]=await Promise.all([Promise.all(wanted.map(k=>cloud.api.listOperations(k,workspace))),cloud.api.listSchedule(workspace)]);
   if(seq!==loadSeq.current)return;
   setData(prev=>({...prev,...Object.fromEntries(wanted.map((k,i)=>[k,all[i].records]))}));setSchedule(cal.records||[]);
  }catch(e){if(seq===loadSeq.current)setError(e instanceof Error?e.message:'Unable to load Sadhana records.');}finally{if(seq===loadSeq.current)setBusy(false);}
 };
 useEffect(()=>{void reload();return()=>{loadSeq.current++;};},[cloud?.api,workspace,teacherMode]);
 const masters=visibleMasterClasses(schedule,data.enrolment,teacherMode);
 const sessions=visibleDatedSessions(schedule,data.enrolment,teacherMode);
 const enrolledIds=new Set(data.enrolment.filter(e=>!e.archived).map(e=>e.studentId));
 const summary={students:data.student.length,activeEnrolments:data.enrolment.filter(e=>!e.archived).length,attendance:data.attendance.length,present:data.attendance.filter(a=>a.status==='present'||a.status==='late').length,practice:data.practice.length,practiceMinutes:data.practice.reduce((n,r)=>n+(r.didPractice?Number(r.minutes)||0:0),0),rsvp:data.rsvp.length};
 const rows=data[area].filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 const studentName=(id:string)=>data.student.find(s=>s.id===id)?.name||id;
 const className=(id:string)=>masters.find(c=>c.id===id)?.name||schedule.find(c=>c.id===id)?.name||id;
 const open=(record:any=null)=>{setEdit(record);setDraft(record?Object.fromEntries(fields[area].map(f=>[f.key,record[f.key]??(empty[area] as any)[f.key]])):{...empty[area],...(initialStudent?{studentId:initialStudent}:{}),...(initialClass?{classId:initialClass}:{})});setShowForm(true);setError('');};
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();if(!cloud)return;setBusy(true);setError('');try{
   const payload={...draft};if(area==='student')payload.adultConfirmed=!payload.familyId;
   if(area==='practice')payload.minutes=Number(payload.minutes);
   if(edit)await cloud.api.updateOperation(area,workspace,edit.id,payload,edit.version);
   else await cloud.api.createOperation(area,workspace,payload);
   setShowForm(false);setNotice(`${labels[area].slice(0,-1)} saved to DynamoDB.`);await reload();
  }catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}
 };
 const field=(f:{key:string;label:string;type?:string;required?:boolean})=>{
  const v=draft[f.key]??'';let options:any[]|null=null;
  if(f.key==='familyId')options=[{id:'',name:'Independent adult'},...data.family.map(x=>({id:x.id,name:x.parentName}))];
  if(f.key==='studentId'){const selectedSession=sessions.find(x=>x.id===draft.sessionId);const classId=area==='enrolment'?'':area==='attendance'||area==='rsvp'?selectedSession?.classId||'':draft.classId||'';const eligible=eligibleStudentIds(data.enrolment,classId,area==='attendance'||area==='rsvp'?selectedSession?.date:draft.date);options=data.student.filter(x=>area==='enrolment'||eligible.has(x.id)).map(x=>({id:x.id,name:x.name}));}
  if(f.key==='classId')options=masters.map(x=>({id:x.id,name:x.name}));
  if(f.key==='sessionId')options=sessions.map(x=>({id:x.id,name:`${x.date} · ${x.name}`}));
  if(f.key==='intention')options=['attending','not_attending','unknown'].map(x=>({id:x,name:({attending:'Attending',not_attending:'Not attending',unknown:'No response'} as Record<string,string>)[x]}));
  if(f.key==='status')options=['present','absent','late','excused'].map(x=>({id:x,name:x[0].toUpperCase()+x.slice(1)}));
  return <label key={f.key} className="ops-field"><span>{f.label}{f.required&&(v===''||v===null||v===undefined)&&<b> *</b>}</span>{typeof v==='boolean'?<select value={v?'yes':'no'} onChange={e=>setDraft({...draft,[f.key]:e.target.value==='yes'})}><option value="yes">Yes</option><option value="no">No</option></select>:options?<select required={f.required} value={v} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}><option value="">Choose…</option>{options.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>:<input required={f.required} type={f.type||'text'} value={v} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>}</label>;
 };
 if(teacherMode)return <TeacherWorkspace cloud={cloud} workspace={workspace} initialArea={initialArea}/>;
 return <div className="ops"><div className="page-heading"><div><div className="eyebrow">LIVE ACADEMY OPERATIONS</div><h1>{teacherMode?'My teaching records':'Families, students & teaching'}</h1><p>DynamoDB-backed records · {workspace==='raaga'?'Raagasudha':'Sruti'} · {teacherMode?'Assigned classes only':'Academy administration'}</p></div><button className="reg-secondary" disabled={busy} onClick={()=>void reload()}><RefreshCw size={16}/> Refresh</button></div>
  <div className="ops-summary" aria-label="Live operational summary"><div><span>Students</span><strong>{summary.students}</strong></div><div><span>Active enrolments</span><strong>{summary.activeEnrolments}</strong></div><div><span>Recorded attendance</span><strong>{summary.attendance?`${Math.round(100*summary.present/summary.attendance)}%`:'—'}</strong></div><div><span>Practice entries</span><strong>{summary.practice}</strong><small>{summary.practiceMinutes} minutes</small></div><div><span>RSVP responses</span><strong>{summary.rsvp}</strong></div></div><section className="surface ops-panel"><div className="ops-tabs">{kinds.map(k=><button key={k} className={area===k?'active':''} onClick={()=>{setArea(k);setShowForm(false);setSearch('');}}>{labels[k]} <small>{data[k].length}</small></button>)}</div>
  <div className="ops-toolbar"><input aria-label="Search operational records" placeholder={`Search ${labels[area].toLowerCase()}…`} value={search} onChange={e=>setSearch(e.target.value)}/>{(admin||!['enrolment','family','student'].includes(area))&&!(teacherMode&&area==='attendance')&&<button className="reg-primary" disabled={busy} onClick={()=>open()}><Plus size={16}/> Add {area}</button>}</div>
  {teacherMode&&area==='attendance'&&cloud&&<SessionAttendanceRegister cloud={cloud} workspace={workspace} schedule={schedule} students={data.student} enrolments={data.enrolment} attendance={data.attendance} onSaved={reload}/>}
  {(area==='enrolment'||area==='attendance'||area==='practice')&&<div className="ops-roster" aria-label="Class roster overview"><h2>Class rosters</h2><p>Current active enrolments · {teacherMode?'classes represented in your assigned enrolments':'all active master classes'}</p><div className="ops-roster-list">{masters.map(c=>{const roster=enrolledStudentIds(data.enrolment,c.id);return <details key={c.id}><summary>{c.name} · {roster.size} student{roster.size===1?'':'s'}</summary><ul>{data.student.filter(st=>roster.has(st.id)).map(st=><li key={st.id}>{st.name}</li>)}{roster.size===0&&<li>No active enrolments</li>}</ul></details>;})}{masters.length===0&&<p>No eligible classes found.</p>}</div></div>}
  {notice&&<p className="ops-notice"><CheckCircle2 size={16}/>{notice}</p>}{error&&<p className="sadhana-sync-error" role="alert">{error}</p>}
  {showForm&&<form className="ops-form" onSubmit={save}><h2>{edit?'Edit':'Add'} {area}</h2><div className="ops-fields">{fields[area].map(field)}</div><div className="ops-actions"><button type="button" className="reg-secondary" onClick={()=>setShowForm(false)}>Cancel</button><button className="reg-primary" disabled={busy}>{busy?'Saving…':'Save to DynamoDB'}</button></div></form>}
  <div className="table-scroll"><table className="data-table"><thead><tr><th>Record</th><th>Details</th><th>Status / date</th><th/></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.name||r.parentName||studentName(r.studentId)}</strong>{!teacherMode&&<small style={{display:'block'}}>{r.id}</small>}</td><td>{r.classId?className(r.classId):r.familyId||r.phone||r.sessionId||'—'}</td><td>{r.date||r.startDate||r.status||r.updatedAt?.slice(0,10)}</td><td>{(admin||!['enrolment','family','student'].includes(area))&&!(teacherMode&&area==='attendance')&&<button className="reg-secondary" onClick={()=>open(r)}>Edit</button>}</td></tr>)}{!rows.length&&<tr><td colSpan={4}>No records found.</td></tr>}</tbody></table></div>
  </section></div>;
}
