import {useEffect,useMemo,useState} from 'react';
import {BookOpenCheck} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import {filterPracticeEntries,practiceTotals} from './practiceSelectors';

type Feedback={id:string;comment:string;createdAt:string};
export default function PracticeReview({cloud,workspace,entries,students,onReload}:{cloud:CloudSession;workspace:InstitutionId;entries:any[];students:any[];onReload:()=>Promise<void>}){
 const [open,setOpen]=useState(''),[comment,setComment]=useState(''),[feedback,setFeedback]=useState<Record<string,Feedback[]>>({});
 const [studentId,setStudentId]=useState(''),[search,setSearch]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const names=useMemo(()=>new Map<string,string>(students.map(s=>[s.id,s.name])),[students]);
 const shown=useMemo(()=>filterPracticeEntries(entries,studentId,search),[entries,studentId,search]);
 const totals=useMemo(()=>practiceTotals(entries),[entries]);
 useEffect(()=>{setOpen('');setFeedback({});setComment('');setNotice('');setError('');setStudentId('');setSearch('')},[workspace]);
 const inspect=async(id:string)=>{
  setOpen(id);setComment('');setNotice('');setError('');
  try{const rows=await cloud.api.teacherPracticeComments(workspace,id);setFeedback(v=>({...v,[id]:rows.records}));}
  catch(e){setError(e instanceof Error?e.message:'Unable to load comments');}
 };
 const submit=async(id:string)=>{
  if(!comment.trim()||busy)return;
  setBusy(true);setError('');setNotice('');
  try{await cloud.api.addTeacherPracticeComment(workspace,id,comment.trim());setComment('');setNotice('Comment saved.');await inspect(id);await onReload();}
  catch(e){setError(e instanceof Error?e.message:'Could not save comment');}
  finally{setBusy(false)}
 };
 const selected=entries.find(p=>p.id===open);
 return <section className="tw-review">
  <div className="tw-section-head"><h2>Student practice</h2><span>{totals.entries} entries · {totals.minutes} minutes</span></div>
  <p className="tw-hint">Students and authorised guardians record practice. Review submissions and leave feedback here.</p>
  {error&&<p role="alert" className="sadhana-sync-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!entries.length?<div className="tw-practice-empty" role="status"><BookOpenCheck size={28} aria-hidden="true"/><strong>No practice recorded yet</strong><p>When students or guardians submit practice for this class, entries will appear here for review and feedback.</p></div>:<>
   <div className="tw-practice-filters"><label>Student <select value={studentId} onChange={e=>{setStudentId(e.target.value);setOpen('')}}><option value="">All students</option>{students.filter(s=>entries.some(p=>p.studentId===s.id)).map(s=><option key={s.id} value={s.id}>{s.name}{s.rollNumber?` · ${s.rollNumber}`:''}</option>)}</select></label><label>Search practice <input value={search} onChange={e=>{setSearch(e.target.value);setOpen('')}} placeholder="Topic, notes or date"/></label></div>
   <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Student</th><th>Topic</th><th>Minutes</th><th>Feedback</th></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td>{p.date}</td><td>{names.get(p.studentId)||'Student'}</td><td>{p.topic||p.comments||'Practice'}</td><td>{p.minutes||0}</td><td><button type="button" className="reg-secondary" onClick={()=>void inspect(p.id)}>{open===p.id?'Reviewing':'Review'}</button></td></tr>)}</tbody></table></div>
   {!shown.length&&<p className="tw-hint">No practice matches these filters.</p>}
   {open&&selected&&<section className="tw-practice-feedback" aria-label="Practice feedback"><h3>Feedback for {names.get(selected.studentId)||'student'} · {selected.date}</h3><p className="tw-hint">{selected.topic||'Practice'} · {selected.minutes||0} minutes</p>{feedback[open]?.map(f=><p key={f.id}>{f.comment} <small>· {f.createdAt.slice(0,10)}</small></p>)}{feedback[open]?.length===0&&<p>No teacher comments yet.</p>}<label htmlFor="teacher-comment">Add comment</label><textarea id="teacher-comment" maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Feedback on the student's practice"/><div className="tw-feedback-actions"><button type="button" className="reg-primary" disabled={busy||!comment.trim()} onClick={()=>void submit(open)}>{busy?'Saving…':'Save comment'}</button><button type="button" className="reg-secondary" onClick={()=>{setOpen('');setComment('')}}>Close</button></div></section>}
  </>}
 </section>;
}
