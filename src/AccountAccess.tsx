import {useEffect,useState} from 'react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import './accountAccess.css';
type RequestRow={studentId:string;subject:string;kind:string;status:string;version:number};
export default function AccountAccess({cloud,institution}:{cloud:CloudSession;institution:InstitutionId}){
 const [rows,setRows]=useState<RequestRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[filter,setFilter]=useState('pending');
 const load=async()=>{setLoading(true);setError('');try{const result=await cloud.api.listAccessRequests(institution);setRows(result.records)}catch(e){setError(e instanceof Error?e.message:'Unable to load requests')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[institution]);
 const act=async(row:RequestRow,decision:'approved'|'rejected'|'revoked')=>{
  const label=decision==='approved'?'approve':decision==='rejected'?'reject':'revoke';
  if(!window.confirm(`Confirm ${label} access for this exact student/account pair? Verify the relationship independently first.`))return;
  setBusy(true);setError('');try{await cloud.api.decideStudentLink(institution,row.subject,row.studentId,decision,row.version);await load()}catch(e){setError(e instanceof Error?e.message:'Could not save decision')}finally{setBusy(false)}
 };
 const selected=rows.filter(r=>filter==='all'||r.status===filter);
 return <section className="surface access-console"><header><div><h2>Account Access</h2><p>Review student and guardian account links. Account ownership and family relationships must be verified outside this list before approval.</p></div><button type="button" onClick={()=>void load()} disabled={busy||loading}>Refresh</button></header>
 <div className="access-controls"><label>Show <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="revoked">Revoked</option><option value="all">All</option></select></label><span>{selected.length} requests</span></div>
 {error&&<p role="alert" className="reg-error">{error}</p>}{loading?<p>Loading requests…</p>:<div className="access-table-wrap"><table><thead><tr><th>Account reference</th><th>Student record</th><th>Request type</th><th>Status</th><th>Action</th></tr></thead><tbody>{selected.map(r=><tr key={`${r.subject}:${r.studentId}`}><td><code>{r.subject.slice(0,8)}…</code></td><td><code>{r.studentId.slice(0,15)}…</code></td><td>{r.kind}</td><td>{r.status}</td><td>{r.status==='pending'?<><button disabled={busy} onClick={()=>void act(r,'approved')}>Approve</button> <button disabled={busy} onClick={()=>void act(r,'rejected')}>Reject</button></>:r.status==='approved'?<button disabled={busy} onClick={()=>void act(r,'revoked')}>Revoke</button>:null}</td></tr>)}{!selected.length&&<tr><td colSpan={5}>No matching requests.</td></tr>}</tbody></table></div>}
 <p className="access-note">Approval does not create Cognito users or send invitations. Never approve a link based solely on a matching name or an account reference.</p></section>
}
