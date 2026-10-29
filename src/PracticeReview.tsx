import './v1376PracticeInsights.css';
import {useEffect,useMemo,useState} from 'react';
import {BookOpenCheck} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import {filterPracticeEntries,practiceTotals} from './practiceSelectors';

type Feedback={id:string;comment:string;createdAt:string};
export default function PracticeReview({cloud,workspace,entries,students,onReload}:{cloud:CloudSession;workspace:InstitutionId;entries:any[];students:any[];onReload:()=>Promise<void>}){
 const [open,setOpen]=useState(''),[comment,setComment]=useState(''),[feedback,setFeedback]=useState<Record<string,Feedback[]>>({});
 const [studentId,setStudentId]=useState(''),[search,setSearch]=useState('');
 const [period,setPeriod]=useState<'week'|'month'|'all'>('week');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const names=useMemo(()=>new Map<string,string>(students.map(s=>[s.id,s.name])),[students]);
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
 const days=useMemo(()=>Array.from({length:7},(_,i)=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-6+i);return d.toISOString().slice(0,10)}),[today]);
 const start=period==='week'?days[0]:period==='month'?today.slice(0,7)+'-01':'';
 const scoped=useMemo(()=>entries.filter(p=>String(p.date||'')<=today&&(!start||String(p.date||'')>=start)),[entries,start,today]);
 const shown=useMemo(()=>filterPracticeEntries(scoped,studentId,search),[scoped,studentId,search]);
 const learnerSummary=useMemo(()=>students.filter(s=>entries.some(p=>p.studentId===s.id)).map(s=>{const rows=scoped.filter(p=>p.studentId===s.id);const sum=(x:any[])=>x.reduce((n,p)=>n+(Number(p.minutes)||0),0);return {student:s,rows,minutes:sum(rows),days:new Set(rows.filter(p=>Number(p.minutes)>0).map(p=>p.date)).size,week:days.map(d=>sum(entries.filter(p=>p.studentId===s.id&&p.date===d)))};}),[students,entries,scoped,days]);
 const scopeMinutes=scoped.reduce((n,p)=>n+(Number(p.minutes)||0),0);
 const participantCount=new Set(scoped.filter(p=>Number(p.minutes)>0).map(p=>p.studentId)).size;
 const avgMinutes=participantCount?Math.round(scopeMinutes/participantCount):0;
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
  <div className="v1376-period"><span>Practice period</span><div><button type="button" aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>Last 7 days</button><button type="button" aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>This month</button><button type="button" aria-pressed={period==='all'} onClick={()=>setPeriod('all')}>All time</button></div></div>
  <div className="v1376-stats"><div><small>Total minutes</small><strong>{scopeMinutes}</strong></div><div><small>Students practised</small><strong>{participantCount} / {new Set(entries.map(p=>p.studentId)).size}</strong></div><div><small>Avg minutes / participant</small><strong>{avgMinutes}</strong></div></div>
  <section className="v1376-consistency" aria-label="Weekly practice consistency"><div className="v1376-section-top"><h3>Weekly practice consistency</h3><small>Daily recorded minutes · last 7 days</small></div>{learnerSummary.length?<>{learnerSummary.map(row=><div className="v1376-learner-row" key={row.student.id}><div className="v1376-learner-head"><strong>{row.student.name}{row.student.rollNumber?` · ${row.student.rollNumber}`:''}</strong><small>{row.week.filter(v=>v>0).length}/7 days · {row.week.reduce((a,b)=>a+b,0)} min</small></div><div className="v1376-week">{row.week.map((mins,i)=><div key={days[i]} title={`${days[i]} · ${mins} minutes`} className={mins===0?'v1376-none':mins<15?'v1376-low':mins<30?'v1376-medium':'v1376-high'}><span>{days[i].slice(5)}</span><strong>{mins||'—'}</strong></div>)}</div></div>)}</>:<p className="tw-hint">No recorded practice for this class.</p>}<p className="tw-hint">An empty day means no practice was logged, not necessarily that no practice occurred.</p></section>
  <div className="v1376-section-top"><h3>Student practice summary</h3><small>Selected period</small></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Days logged</th><th>Minutes</th><th>Latest entry</th></tr></thead><tbody>{learnerSummary.map(row=><tr key={row.student.id}><td>{row.student.name}</td><td>{row.days}</td><td>{row.minutes}</td><td>{row.rows.map(p=>p.date).sort().at(-1)||'—'}</td></tr>)}</tbody></table></div>
  <h3>Practice entries & teacher feedback</h3>

  {error&&<p role="alert" className="sadhana-sync-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!entries.length?<div className="tw-practice-empty" role="status"><BookOpenCheck size={28} aria-hidden="true"/><strong>No practice recorded yet</strong><p>When students or guardians submit practice for this class, entries will appear here for review and feedback.</p></div>:<>
   <div className="tw-practice-filters"><label>Student <select value={studentId} onChange={e=>{setStudentId(e.target.value);setOpen('')}}><option value="">All students</option>{students.filter(s=>entries.some(p=>p.studentId===s.id)).map(s=><option key={s.id} value={s.id}>{s.name}{s.rollNumber?` · ${s.rollNumber}`:''}</option>)}</select></label><label>Search practice <input value={search} onChange={e=>{setSearch(e.target.value);setOpen('')}} placeholder="Topic, notes or date"/></label></div>
   <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Student</th><th>Topic</th><th>Minutes</th><th>Feedback</th></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td>{p.date}</td><td>{names.get(p.studentId)||'Student'}</td><td>{p.topic||p.comments||'Practice'}</td><td>{p.minutes||0}</td><td><button type="button" className="reg-secondary" onClick={()=>void inspect(p.id)}>{open===p.id?'Reviewing':'Review'}</button></td></tr>)}</tbody></table></div>
   {!shown.length&&<p className="tw-hint">No practice matches these filters.</p>}
   {open&&selected&&<section className="tw-practice-feedback" aria-label="Practice feedback"><h3>Feedback for {names.get(selected.studentId)||'student'} · {selected.date}</h3><p className="tw-hint">{selected.topic||'Practice'} · {selected.minutes||0} minutes</p>{feedback[open]?.map(f=><p key={f.id}>{f.comment} <small>· {f.createdAt.slice(0,10)}</small></p>)}{feedback[open]?.length===0&&<p>No teacher comments yet.</p>}<label htmlFor="teacher-comment">Add comment</label><textarea id="teacher-comment" maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Feedback on the student's practice"/><div className="tw-feedback-actions"><button type="button" className="reg-primary" disabled={busy||!comment.trim()} onClick={()=>void submit(open)}>{busy?'Saving…':'Save comment'}</button><button type="button" className="reg-secondary" onClick={()=>{setOpen('');setComment('')}}>Close</button></div></section>}
  </>}
 </section>;
}
