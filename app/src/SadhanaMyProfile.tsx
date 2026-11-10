import {useEffect,useState} from 'react';
import type {CloudSession} from './CloudAuth';
import PhotoAvatarEditor from './PhotoAvatarEditor';
import {jpegData} from './ProfilePhotoUpload';
import type {InstitutionId} from './types';
import './sadhanaMyProfile.css';
type Profile={name:string;givenName:string;familyName:string;email:string;emailVerified:boolean;phone:string;phoneVerified:boolean;photoUrl?:string};
type FamilyStudent={id:string;name:string;rollNumber:string;institution:InstitutionId;kind:string};
const EMPTY:Profile={name:'',givenName:'',familyName:'',email:'',emailVerified:false,phone:'',phoneVerified:false};
function FamilyStudentProfile({cloud,child}:{cloud:CloudSession;child:FamilyStudent}){
 const [details,setDetails]=useState<Awaited<ReturnType<CloudSession['api']['learnerExtras']>>|null>(null);
 const [displayName,setDisplayName]=useState(''),[photoUrl,setPhotoUrl]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{
  const [profile,media]=await Promise.all([cloud.api.learnerExtras(child.institution,child.id),cloud.api.listLearnerMedia(child.institution,child.id)]);
  setDetails(profile);setDisplayName(profile.profile.preferredName||profile.student.name);
  const photo=media.records.filter(item=>item.purpose==='profile'&&item.mime.startsWith('image/')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  setPhotoUrl(photo?.url||'');
 };
 useEffect(()=>{let active=true;Promise.all([cloud.api.learnerExtras(child.institution,child.id),cloud.api.listLearnerMedia(child.institution,child.id)])
  .then(([profile,media])=>{if(!active)return;setDetails(profile);setDisplayName(profile.profile.preferredName||profile.student.name);
   const photo=media.records.filter(item=>item.purpose==='profile'&&item.mime.startsWith('image/')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];setPhotoUrl(photo?.url||'');})
  .catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load this child profile')});
  return()=>{active=false};},[cloud.api,child.id,child.institution]);
 const save=async(event:React.FormEvent)=>{event.preventDefault();if(!details||busy)return;setBusy(true);setError('');setNotice('');
  try{await cloud.api.saveLearnerProfile(child.institution,child.id,{preferredName:displayName,phone:details.profile.phone,about:details.profile.about,expectedVersion:details.profile.version});await load();setNotice('Display name updated.');}
  catch(e){setError(e instanceof Error?e.message:'Could not save this profile')}finally{setBusy(false)}
 };
 const upload=async(file:File|undefined)=>{if(!file||busy)return;setBusy(true);setError('');setNotice('');
  try{const image=await jpegData(file),blob=await(await fetch(image)).blob();
   const signed=await cloud.api.beginLearnerMedia(child.institution,child.id,{mime:'image/jpeg',size:blob.size,purpose:'profile'});
   const result=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:blob});if(!result.ok)throw Error(`Photo upload failed (${result.status}).`);
   await cloud.api.finishLearnerMedia(child.institution,child.id,signed.key,'profile');await load();setNotice('Profile picture updated.');
  }catch(e){setError(e instanceof Error?e.message:'Could not upload this profile picture')}finally{setBusy(false)}
 };
 return <section className="sadhana-profile-panel sadhana-family-child-profile" aria-label={`${child.name} profile`}>
  <div className="sadhana-family-child-heading"><div className="sadhana-family-child-avatar">{photoUrl?<img src={photoUrl} alt={`${child.name} profile picture`}/>:<span>{(displayName||child.name||'S').slice(0,1).toUpperCase()}</span>}</div>
   <div><h3>{displayName||child.name}</h3><p>{child.rollNumber?`Student · ${child.rollNumber}`:'Family student profile'}</p></div></div>
  {error&&<p className="sadhana-profile-error" role="alert">{error}</p>}
  {details?<form className="sadhana-family-child-form" onSubmit={e=>void save(e)}>
   <label>Name shown in the portal<input required maxLength={80} value={displayName} onChange={e=>setDisplayName(e.target.value)}/><small>Legal records remain managed by the academy.</small></label>
   <label>Profile picture<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.currentTarget.files?.[0];void upload(file);e.currentTarget.value='';}}/><small>JPG, PNG or WebP · up to 5 MB</small></label>
   <button type="submit" disabled={busy||!displayName.trim()}>{busy?'Saving…':'Save name'}</button>
   {notice&&<p className="sadhana-profile-success" role="status">{notice}</p>}
  </form>:!error&&<p role="status">Loading profile…</p>}
 </section>;
}
export default function SadhanaMyProfile({cloud,onPhotoChange,familyStudents=[]}:{cloud:CloudSession;onPhotoChange?:(url:string)=>void;familyStudents?:FamilyStudent[]}){
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
   {familyStudents.length>0&&<section className="sadhana-family-profiles" aria-label="My children profiles"><div><span className="eyebrow">FAMILY</span><h2>My children</h2><p>Update each child’s portal name and profile picture.</p></div><div className="sadhana-family-profile-grid">{[...new Map(familyStudents.map(child=>[child.id,child])).values()].map(child=><FamilyStudentProfile key={child.id} cloud={cloud} child={child}/>)}</div></section>}
   {error&&<p role="alert" className="sadhana-profile-error">{error}</p>}{notice&&<p role="status" className="sadhana-profile-success">{notice}</p>}
 </section>;
}
