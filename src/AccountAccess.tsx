import {useEffect,useState} from 'react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import './accountAccess.css';
type RequestRow={studentId:string;subject:string;kind:string;status:string;version:number};
type Student={id:string;name:string;rollNumber?:string;archived?:boolean};
export default function AccountAccess({cloud,institution}:{cloud:CloudSession;institution:InstitutionId}){
 const [rows,setRows]=useState<RequestRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[filter,setFilter]=useState('pending');
 const [students,setStudents]=useState<Student[]>([]),[studentId,setStudentId]=useState(''),[requestError,setRequestError]=useState(''),[notice,setNotice]=useState('');
 const mySubject=cloud.staff.subject;
 const [accounts,setAccounts]=useState<Record<string,{name:string;email:string}>>({});
 const studentById=new Map(students.map(s=>[s.id,s]));
 const accountLabel=(subject:string)=>subject===mySubject?cloud.staff.displayName||'My account':accounts[subject]?.name||'Account details unavailable';
 const load=async()=>{setLoading(true);setError('');try{const result=await cloud.api.listAccessRequests(institution);setRows(result.records)}catch(e){setRows([]);setError(e instanceof Error?e.message:'Unable to load requests')}finally{setLoading(false)}};
 useEffect(()=>{void load();setStudentId('');setRequestError('');setNotice('');let active=true;
  cloud.api.listAdministrators(institution).then(r=>{if(active)setAccounts(Object.fromEntries((r.records||[]).map(a=>[a.sub,{name:a.displayName,email:a.email}])))}).catch(()=>{if(active)setAccounts({})});
  cloud.api.listOperations('student',institution).then(r=>{if(active)setStudents((r.records||[]).filter((s:Student)=>!s.archived))}).catch(()=>{if(active)setStudents([])});
  return()=>{active=false};
 },[institution]);
 const submitSelf=async()=>{
  if(!studentId)return;setBusy(true);setRequestError('');setNotice('');
  try{await cloud.api.requestStudentLink(institution,studentId,'student');setNotice('Your student access request is pending approval. No access has been granted.');await load()}
  catch(e){setRequestError(e instanceof Error?e.message:'Unable to submit access request')}
  finally{setBusy(false)}
 };
 const act=async(row:RequestRow,decision:'approved'|'rejected'|'revoked')=>{
  const label=decision==='approved'?'approve':decision==='rejected'?'reject':'revoke';
  if(!window.confirm(`Confirm ${label} access for this exact student/account pair? Verify the relationship independently first.`))return;
  setBusy(true);setError('');try{await cloud.api.decideStudentLink(institution,row.subject,row.studentId,decision,row.version);await load()}catch(e){setError(e instanceof Error?e.message:'Could not save decision')}finally{setBusy(false)}
 };
 const selectableStudents=students.filter(s=>!rows.some(r=>r.subject===mySubject&&r.studentId===s.id&&(r.status==='approved'||r.status==='pending')));
 const myApproved=rows.filter(r=>r.subject===mySubject&&r.status==='approved');
 const selected=rows.filter(r=>filter==='all'||r.status===filter);
 const unavailable=/unknown endpoint|not found|404/i.test(error);
 return <section className="surface access-console"><header><div><h2>Account Access</h2><p>Manage verified student and guardian access for {institution==='raaga'?'Raagasudha':'Śruti Vedam'}.</p></div><button type="button" onClick={()=>void load()} disabled={busy||loading}>Refresh</button></header>
 <section className="access-self-link" aria-label="Request your student access"><div>{myApproved.length>0&&<p role="status">Your student access is approved. Use View as → Student to open your learning workspace.</p>}<h3>Also a student?</h3><p>Use your existing Sadhana login. Select your own student record to request access. Approved or pending records are hidden below.</p></div><div className="access-self-controls"><label htmlFor="access-self-student">Your student record</label><select id="access-self-student" value={studentId} onChange={e=>setStudentId(e.target.value)} disabled={busy}><option value="">Choose a student…</option>{selectableStudents.map(s=><option value={s.id} key={s.id}>{s.name}{s.rollNumber?` · ${s.rollNumber}`:''}</option>)}</select><button type="button" onClick={()=>void submitSelf()} disabled={!studentId||busy}>Request Student access</button></div>{requestError&&<p role="alert" className="reg-error">{requestError}</p>}{notice&&<p role="status" className="access-success">{notice}</p>}</section>
 <div className="access-controls"><label>Show <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="revoked">Revoked</option><option value="all">All</option></select></label><span>{loading?'Checking requests…':error?'Requests unavailable':`${selected.length} requests`}</span></div>
 {error&&<div role="alert" className="access-error"><strong>{unavailable?'Account Access API is not deployed yet':'Unable to load account requests'}</strong><p>{unavailable?'The frontend is installed, but the running development Lambda does not recognise the Account Access endpoint. Deploy the verified backend before submitting or approving requests.':error}</p></div>}
 {loading?<p role="status">Loading requests…</p>:!error?<div className="access-table-wrap"><table><thead><tr><th>Account holder</th><th>Student</th><th>Request type</th><th>Status</th><th>Action</th></tr></thead><tbody>{selected.map(r=><tr key={`${r.subject}:${r.studentId}`}><td><strong>{accountLabel(r.subject)}</strong>{accounts[r.subject]?.email&&<small style={{display:"block",color:"#718096"}}>{accounts[r.subject].email}</small>}{!accounts[r.subject]&&r.subject!==mySubject&&<small style={{display:"block",color:"#718096"}}>Account reference: {r.subject.slice(0,8)}…</small>}</td><td><strong>{studentById.get(r.studentId)?.name||"Student record unavailable"}</strong><small style={{display:"block",color:"#718096"}}>{studentById.get(r.studentId)?.rollNumber?`Roll ${studentById.get(r.studentId)?.rollNumber}`:`Record ${r.studentId.slice(0,12)}…`}</small></td><td>{r.kind==='student'?'Student (self)':'Guardian'}</td><td>{r.status}</td><td>{r.status==='pending'?<><button disabled={busy} onClick={()=>void act(r,'approved')}>Approve</button> <button disabled={busy} onClick={()=>void act(r,'rejected')}>Reject</button></>:r.status==='approved'?<button disabled={busy} onClick={()=>void act(r,'revoked')}>Revoke</button>:null}</td></tr>)}{!selected.length&&<tr><td colSpan={5}>No {filter==='all'?'':filter} access requests.</td></tr>}</tbody></table></div>:null}
 <p className="access-note">An approved link gives access only to the selected student and institution. Do not approve links from name matching alone. Approvals are checked by the backend and audited. Super Admin self-approval requires explicit backend authorisation.</p></section>;
}
