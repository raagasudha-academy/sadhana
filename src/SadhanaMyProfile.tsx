import {useEffect,useState} from 'react';
import type {CloudSession} from './CloudAuth';
import PhotoAvatarEditor from './PhotoAvatarEditor';
import './sadhanaMyProfile.css';
type Profile={name:string;givenName:string;familyName:string;email:string;emailVerified:boolean;phone:string;phoneVerified:boolean;photoUrl?:string};
const EMPTY:Profile={name:'',givenName:'',familyName:'',email:'',emailVerified:false,phone:'',phoneVerified:false};
export default function SadhanaMyProfile({cloud,onPhotoChange}:{cloud:CloudSession;onPhotoChange?:(url:string)=>void}){
 const [profile,setProfile]=useState<Profile>(EMPTY);
 const [photoUrl,setPhotoUrl]=useState('');
 const [form,setForm]=useState({name:'',givenName:'',familyName:''});
 const [pendingPhone,setPendingPhone]=useState('');
 const [code,setCode]=useState('');
 const [step,setStep]=useState<'edit'|'verify'>('edit');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;cloud.api.getMyProfile().then(p=>{if(active){setProfile(p);setForm({name:p.name,givenName:p.givenName,familyName:p.familyName});setPhotoUrl(p.photoUrl||'');onPhotoChange?.(p.photoUrl||'');}}).catch(e=>{if(active)setError(String(e.message||e));});return()=>{active=false;};},[cloud.api,cloud.staff.subject]);
 const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}};
 return <section className="sadhana-my-profile" aria-label="My Profile">
   <header><span className="eyebrow">MY ACCOUNT</span><h1>My Profile</h1><p>Manage your personal details, picture and verified contact number.</p></header>
   <div className="sadhana-my-profile-grid">
    <div className="sadhana-profile-panel"><div className="sadhana-profile-avatar"><PhotoAvatarEditor api={cloud.api} onUploaded={url=>{setPhotoUrl(url);onPhotoChange?.(url);setNotice('Profile picture updated.');}} label="your profile picture"><div className="sadhana-profile-avatar-fallback" title="Click to change photo">{photoUrl?<img className="sadhana-profile-current-photo" src={photoUrl} alt="Your current profile picture" onError={()=>setPhotoUrl('')}/>: (profile.name||cloud.staff.displayName||'U').slice(0,1).toUpperCase()}</div></PhotoAvatarEditor></div><h2>{profile.name||cloud.staff.displayName||'My account'}</h2><p className="sadhana-profile-email">{profile.email||'Email unavailable'}</p></div>
    <form className="sadhana-profile-panel sadhana-profile-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await cloud.api.updateMyProfile(form);setProfile(result);setNotice('Name updated successfully.');});}}><h2>Personal information</h2><label>Display / full name<input required maxLength={90} autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="sadhana-profile-fields"><label>Given name<input required maxLength={90} autoComplete="given-name" value={form.givenName} onChange={e=>setForm({...form,givenName:e.target.value})}/></label><label>Family name<input required maxLength={90} autoComplete="family-name" value={form.familyName} onChange={e=>setForm({...form,familyName:e.target.value})}/></label></div><button type="submit" disabled={busy}>Save name changes</button></form>
    <div className="sadhana-profile-panel sadhana-profile-wide"><h2>Contact information</h2><div className="sadhana-profile-fields"><label>Email address<input readOnly aria-readonly="true" value={profile.email}/><small>To change your email address, contact an academy administrator.</small></label><label>Current phone number<input readOnly aria-readonly="true" value={profile.phone||'Not added'}/><small>{profile.phoneVerified?'Verified':'Not verified'}</small></label></div>
     {step==='edit'?<form onSubmit={e=>{e.preventDefault();void run(async()=>{if(!/^\+[1-9]\d{7,14}$/.test(pendingPhone))throw Error('Enter your number in international format, e.g. +447700900123');await cloud.beginPhoneChange(pendingPhone);setStep('verify');setNotice('Verification code requested for the new number.');});}}><label>New phone number<input type="tel" autoComplete="tel" placeholder="+447700900123" value={pendingPhone} onChange={e=>setPendingPhone(e.target.value.trim())}/></label><button disabled={busy||!pendingPhone}>Send verification code</button></form>:<form onSubmit={e=>{e.preventDefault();void run(async()=>{await cloud.verifyPhoneChange(code);const updated=await cloud.api.getMyProfile();setProfile(updated);setCode('');setStep('edit');setPendingPhone('');setNotice('Phone number verified.');});}}><label>SMS verification code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} required /></label><div className="sadhana-profile-actions"><button type="submit" disabled={busy}>Verify number</button><button type="button" disabled={busy} onClick={()=>setStep('edit')}>Cancel</button></div></form>}
     <p className="sadhana-profile-hint">Changing your number does not change student access or guardian approval. Your existing email stays unchanged.</p>
    </div>
   </div>
   {error&&<p role="alert" className="sadhana-profile-error">{error}</p>}{notice&&<p role="status" className="sadhana-profile-success">{notice}</p>}
 </section>;
}
