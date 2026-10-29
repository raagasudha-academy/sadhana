import {useEffect,useRef,useState} from 'react';
import './homeworkCard.css';
export interface HomeworkCardData {id:string;title:string;className:string;dueLabel:string;status:string;instructions:string;teacher?:string}
/** Display-only reusable view. Caller owns authorized data and submission actions. */
export default function HomeworkCard({homework}:{homework:HomeworkCardData}){
  const [open,setOpen]=useState(false);const closeRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;closeRef.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[open]);
  return <><button type="button" className="sadhana-hw-card" onClick={()=>setOpen(true)} aria-label={`View ${homework.title} homework`}><span className="sadhana-hw-card__title">{homework.title}</span><span>{homework.className} · Due {homework.dueLabel}</span><span className="sadhana-hw-card__status">{homework.status} <span aria-hidden="true">›</span></span></button>
   {open&&<div className="sadhana-hw-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><aside role="dialog" aria-modal="true" aria-labelledby={`hw-title-${homework.id}`} className="sadhana-hw-drawer"><button ref={closeRef} type="button" className="sadhana-hw-close" onClick={()=>setOpen(false)}>Close ×</button><h2 id={`hw-title-${homework.id}`}>{homework.title}</h2><p>{homework.className} · Due {homework.dueLabel}</p><p><strong>Status:</strong> {homework.status}</p>{homework.teacher&&<p><strong>Teacher:</strong> {homework.teacher}</p>}<h3>Instructions</h3><p className="sadhana-hw-instructions">{homework.instructions}</p></aside></div>}
  </>;
}
