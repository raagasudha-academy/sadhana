import {useEffect,useState} from 'react';
import {MessageCircle, Minus, X} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {InstitutionId} from './types';
import MessagesPage from './MessagesPage';
import './messagesWidget.css';

export default function MessagesWidget({cloud,institutions:allowed,defaultInstitution,studentId,canChooseInstitution=false}:{cloud:CloudSession;institutions:InstitutionId[];defaultInstitution?:InstitutionId;studentId?:string;canChooseInstitution?:boolean}){
 const [open,setOpen]=useState(false);
 const [minimized,setMinimized]=useState(false);
 const [institution,setInstitution]=useState<InstitutionId>(defaultInstitution&&allowed.includes(defaultInstitution)?defaultInstitution:allowed[0]||'sruti');
 const allowedKey=allowed.join('|');
 useEffect(()=>{if(allowed.length)setInstitution(defaultInstitution&&allowed.includes(defaultInstitution)?defaultInstitution:allowed[0]);},[allowedKey,defaultInstitution]);
 if(!allowed.length)return null;
 return <div className="sadhana-messages-widget">
  {open&&<section className="sadhana-messages-widget-panel" role="dialog" aria-label="Messages" aria-hidden={minimized} style={minimized?{display:'none'}:undefined}>
   <header className="sadhana-messages-widget-head"><div><strong>Messages</strong>{canChooseInstitution&&allowed.length>1&&<label><span className="sadhana-visually-hidden">Academy</span><select aria-label="Messages academy" value={institution} onChange={event=>setInstitution(event.target.value as InstitutionId)}>{allowed.map(id=><option key={id} value={id}>{id==='raaga'?'Raagasudha':'Śruti Vedam'}</option>)}</select></label>}</div><span className="sadhana-messages-widget-controls"><button type="button" onClick={()=>setMinimized(true)} aria-label="Minimize messages" title="Minimize"><Minus size={18}/></button><button type="button" onClick={()=>{setOpen(false);setMinimized(false)}} aria-label="Close messages" title="Close"><X size={18}/></button></span></header>
  <MessagesPage key={`${institution}:${studentId||''}`} cloud={cloud} workspace={institution} studentId={studentId} compact/>
  </section>}
  <button type="button" className="sadhana-messages-widget-trigger" aria-label={!open?'Open messages':minimized?'Restore messages':'Hide messages window'} aria-expanded={open&&!minimized} onClick={()=>{if(!open){setOpen(true);setMinimized(false);}else setMinimized(value=>!value)}}><MessageCircle size={21}/><span>Messages</span></button>
 </div>;
}
