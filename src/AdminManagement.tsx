import {useEffect,useState} from 'react';
import {Plus,UserRound,ShieldCheck,X,RefreshCw,UserPlus,Pencil} from 'lucide-react';
import type {CloudSession} from './CloudAuth';
import type {AdministratorRecord} from './api/sadhanaClient';
import type {InstitutionId} from './types';
import {institutions} from './institutions';
import PhotoAvatarEditor from './PhotoAvatarEditor';
import {NAME_TITLES,splitTitledName,type NameTitle} from './nameTitles';

type AdminCard = Omit<AdministratorRecord,'institution'> & {institutions:InstitutionId[]};
const fileFor:Record<string,string>={
  'mohana':'teachers/mohana-kamanooru.png',
  'mohana kamanooru':'teachers/mohana-kamanooru.png',
  'mrs mohana kamanooru':'teachers/mohana-kamanooru.png',
  'mrs praveena srikailash':'teachers/praveena-srikailash.png',
  'praveena srikailash':'teachers/praveena-srikailash.png',
  'mrs amruta hasa':'teachers/amruta-hasa.png',
  'amruta hasa':'teachers/amruta-hasa.png',
};
function AdminPortrait({admin}:{admin:AdminCard}){
  const file=admin.photo||fileFor[admin.displayName.trim().toLowerCase().replace(/\s+/g,' ')]||fileFor[admin.username.trim().toLowerCase()]||'';
  const safe=/^(teachers|admins)\/[a-z0-9][a-z0-9-]{0,70}\.png$/.test(file);
  const fallback=safe?`${import.meta.env.BASE_URL}${file}`:'';
  const [source,setSource]=useState(admin.photoUrl||fallback);
  useEffect(()=>setSource(admin.photoUrl||fallback),[admin.photoUrl,fallback]);
  const initials=(admin.displayName||admin.username).split(/\s+/).slice(0,2).map(v=>v[0]||'').join('').toUpperCase();
  return <span className="teacher-portrait admin-portrait">
    {source?<img alt="" loading="lazy" src={source}
      onError={()=>setSource(source===admin.photoUrl?fallback:'')}/>
      :<span aria-hidden="true">{initials||<UserRound size={26}/>}</span>}
  </span>;
}

export default function AdminManagement({cloud,workspace}:{cloud?:CloudSession;workspace:string}){
  const allowed=cloud?.staff.role==='admin'?(cloud.staff.adminInstitutions||[]):[];
  const scope:InstitutionId[]=workspace==='raaga'||workspace==='sruti'
    ? (allowed.includes(workspace)?[workspace]:[]) : allowed;
  const scopeKey=[...scope].sort().join(',');
  const [admins,setAdmins]=useState<AdminCard[]>([]);
  const [canManage,setCanManage]=useState(false);
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [dialog,setDialog]=useState<'invite'|'existing'|'profile'|null>(null);
  const [editingUsername,setEditingUsername]=useState('');
  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [title,setTitle]=useState<NameTitle>('');
  const [displayName,setDisplayName]=useState('');
  const [email,setEmail]=useState('');
  const [username,setUsername]=useState('');
  const [institution,setInstitution]=useState<InstitutionId>('sruti');
  const [grant,setGrant]=useState(true);
  const [profileAccess,setProfileAccess]=useState<InstitutionId[]>([]);
  const [profileAccessLoading,setProfileAccessLoading]=useState(false);
  const [profileAccessError,setProfileAccessError]=useState('');
  const [accessRevision,setAccessRevision]=useState(0);

  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');
    if(!cloud?.api||!scopeKey){setAdmins([]);setCanManage(false);setLoading(false);return;}
    const selected=scopeKey.split(',') as InstitutionId[];
    Promise.all(selected.map(i=>cloud.api.listAdministrators(i))).then(result=>{
      if(!active)return;
      const unique=new Map<string,AdminCard>();
      for(const res of result)for(const record of res.records){
        const key=record.sub||record.username;
        const previous=unique.get(key);
        if(previous){
          if(!previous.institutions.includes(record.institution))
            previous.institutions.push(record.institution);
        }else{
          const {institution:inst,...rest}=record;
          unique.set(key,{...rest,institutions:[inst]});
        }
      }
      setAdmins([...unique.values()].sort((a,b)=>a.displayName.localeCompare(b.displayName)));
      setCanManage(result.some(r=>r.canManage));
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load administrators.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[cloud?.api,scopeKey,revision]);


  // Check both Cognito administrator groups, regardless of the selected workspace.
  // A single-workspace directory cannot accurately show cross-institution access.
  useEffect(()=>{
    if(dialog!=='profile'||!cloud?.api||!canManage||!editingUsername)return;
    let active=true;
    setProfileAccessLoading(true);
    setProfileAccessError('');
    const both:InstitutionId[]=['raaga','sruti'];
    Promise.all(both.map(inst=>cloud.api.listAdministrators(inst)))
      .then(results=>{
        if(!active)return;
        const found=results.flatMap(result=>result.records)
          .filter(record=>record.username===editingUsername)
          .map(record=>record.institution);
        setProfileAccess([...new Set(found)]);
      })
      .catch(error=>{
        if(active)setProfileAccessError(error instanceof Error
          ?error.message:'Unable to verify institution access.');
      })
      .finally(()=>{if(active)setProfileAccessLoading(false);});
    return ()=>{active=false;};
  },[dialog,cloud?.api,canManage,editingUsername,accessRevision]);

  const applyProfileAccess=async(inst:InstitutionId)=>{
    if(!cloud||!canManage||busy||profileAccessLoading||profileAccessError)return;
    const target=admins.find(a=>a.username===editingUsername);
    if(!target){setError('This account is no longer in the directory. Refresh and reopen the profile.');return;}
    if(target.sub===cloud.staff.subject){setError('Protected super-admin permissions cannot be changed.');return;}
    const already=profileAccess.includes(inst);
    const change=already?'REMOVE':'GRANT';
    if(!window.confirm(
      `${change} ${institutions[inst].name} administrator access for ${target.displayName} (${editingUsername})?\n\nThis immediately changes Cognito group membership. Name and photo are unaffected.`
    ))return;
    setBusy(true);setError('');
    try{
      await cloud.api.changeAdministratorAccess(editingUsername,inst,!already);
      setProfileAccess(current=>already?current.filter(i=>i!==inst):[...current,inst]);
      setNotice(`${institutions[inst].name} administrator access ${already?'removed':'granted'} for ${target.displayName}.`);
      setRevision(n=>n+1);
      setAccessRevision(n=>n+1);
    }catch(error){
      setError(error instanceof Error?error.message:'Unable to change administrator access.');
    }finally{setBusy(false);}
  };

  const open=(kind:'invite'|'existing')=>{
    setDialog(kind);setError('');setNotice('');setBusy(false);
    setDisplayName('');setEmail('');setUsername('');setGrant(true);setTitle('');
    setInstitution(scope[0]||'sruti');
  };
  const openProfile=(admin:AdminCard)=>{
    setDialog('profile');setError('');setNotice('');setBusy(false);
    setEditingUsername(admin.username);
    setFirstName(admin.firstName||'');setLastName(admin.lastName||'');
    setTitle((admin.title as NameTitle)||splitTitledName(admin.displayName).title);
    setProfileAccess([]);
    setProfileAccessError('');
  };
  const save=async()=>{
    if(!cloud||!canManage||busy)return;
    setBusy(true);setError('');
    try{
      if(dialog==='profile'){
        await cloud.api.updateAdministratorProfile(editingUsername,firstName.trim(),lastName.trim(),title);
        setNotice('Administrator name and title saved to Cognito. No permissions changed.');
      }else if(dialog==='invite'){
        await cloud.api.inviteAdministrator(`${title?`${title} `:''}${splitTitledName(displayName.trim()).name}`,email.trim(),institution);
        setNotice('Cognito invitation requested. Check the new user received their email and can sign in.');
      }else if(dialog==='existing'){
        await cloud.api.changeAdministratorAccess(username.trim(),institution,grant);
        setNotice('Academy administrator access updated. Their access token may need refreshing.');
      }
      setDialog(null);setRevision(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:'Unable to update administrator.');}
    finally{setBusy(false);}
  };
  return <>
    <div className="page-heading">
      <div><div className="eyebrow">ACCOUNT MANAGEMENT</div>
        <h1>Administrators</h1>
        <p>Cognito-backed accounts and academy permissions.</p>
      </div>
      <div className="teacher-page-actions">
        <button type="button" className="reg-secondary" onClick={()=>setRevision(v=>v+1)} title="Refresh administrator directory"><RefreshCw size={16}/> Refresh</button>
        {canManage&&<><button type="button" className="reg-secondary" onClick={()=>open('existing')}><UserPlus size={16}/> Grant Admin Access</button>
          <button type="button" className="reg-primary" onClick={()=>open('invite')}><Plus size={16}/> Invite New Administrator</button></>}
      </div>
    </div>
    {error&&!dialog&&<p className="sadhana-sync-error" role="alert">{error}</p>}
    {notice&&<p className="reg-success" role="status">{notice}</p>}
    <section className="surface reg-section">
      <div className="reg-section-head">
        <div className="teacher-section-title"><h2>Academy Administrators</h2>
          <span className="teacher-section-count">{admins.length} profiles</span></div>
      </div>
      {!canManage&&!loading&&<p className="reg-footnote">Account invitations and permission changes are managed by the designated Sadhana super-admin.</p>}
      {loading?<p className="reg-footnote">Loading Cognito administrator directory…</p>:<div className="venue-manage-grid sadhana-admin-grid">
        {admins.map(a=><article className="venue-manage-card teacher-card sadhana-admin-card" key={a.sub||a.username}>
          <div className="sadhana-admin-main"><AdminPortrait admin={a}/>
            <div className="sadhana-admin-details"><strong>{a.displayName}</strong>
              <small>{a.email||a.username}</small>
              <div className="teacher-b-institutions">{a.institutions.map(inst=><span key={inst}>{institutions[inst].name}</span>)}</div>
            </div>
          </div>
          <div className="sadhana-admin-foot"><span><ShieldCheck size={15}/> {a.enabled?'Account enabled':'Account disabled'}</span>
            <span>{a.status.replace(/_/g,' ').toLowerCase()}</span></div>
          {canManage&&<div className="sadhana-admin-actions">
            <button className="teacher-card-icon" type="button" disabled={busy}
              title={`Edit ${a.displayName}'s profile`} aria-label={`Edit profile for ${a.displayName}`}
              onClick={()=>openProfile(a)}><Pencil size={16}/></button>

          </div>}
        </article>)}
      </div>}
      {!loading&&!admins.length&&<p className="reg-footnote">No administrators found in the selected workspace.</p>}
    </section>
    {dialog&&<div className="reg-shade" onClick={()=>!busy&&setDialog(null)}>
      <section className="reg-modal" role="dialog" aria-modal="true" aria-label="Administrator account access" onClick={e=>e.stopPropagation()}>
        <div className="reg-modal-head"><div>
          <h2>{dialog==='profile'?'Edit Administrator Profile':dialog==='invite'?'Invite New Administrator':'Grant / Revoke Admin Access'}</h2>
          <p>{dialog==='profile'?'Edit name and photo, or manage institution permissions below.':dialog==='invite'?'Creates a new Cognito login and sends an invitation email.':'Use the existing Cognito username (not a teacher ID).'}</p>
        </div><button className="reg-icon-btn" type="button" onClick={()=>setDialog(null)} disabled={busy} aria-label="Close"><X size={18}/></button></div>
        <form className="reg-form" onSubmit={e=>{e.preventDefault();void save();}}>
          {dialog==='profile'?<>
            <label className="reg-field"><span>Title</span><select value={title} onChange={e=>setTitle(e.target.value as NameTitle)}>
              {NAME_TITLES.map(t=><option key={t} value={t}>{t||'No title'}</option>)}
            </select></label>
            <label className="reg-field"><span>First name</span><input required value={firstName} maxLength={60} onChange={e=>setFirstName(e.target.value)}/></label>
            <label className="reg-field"><span>Last name</span><input required value={lastName} maxLength={60} onChange={e=>setLastName(e.target.value)}/></label>
            {cloud&&admins.filter(a=>a.username===editingUsername).map(a=><div key={a.username} className="sadhana-admin-photo-editor">
              <PhotoAvatarEditor api={cloud.api} administratorUsername={editingUsername}
                label={`${a.displayName}'s profile photo`}
                onUploaded={()=>{setRevision(v=>v+1);setNotice('Photo uploaded securely.');}}>
                <AdminPortrait admin={a}/>
              </PhotoAvatarEditor>
              <span>Click the photo to change it. Saved immediately.</span>
            </div>)}
            <p className="reg-footnote">Photo changes save immediately. Use Save Profile to update the name and title.</p>
            <fieldset className="sadhana-admin-access-fieldset">
              <legend>Institution administrator access</legend>
              <p>Manage Cognito permissions separately from profile details. Each Grant or Revoke takes effect immediately after confirmation.</p>
              {profileAccessLoading ? <p className="reg-footnote">Checking both institution groups…</p> :
                profileAccessError ? <p className="sadhana-sync-error" role="alert">{profileAccessError}</p> :
                (['raaga','sruti'] as InstitutionId[]).map(inst=>{
                  const present=profileAccess.includes(inst);
                  const locked=admins.find(a=>a.username===editingUsername)?.sub===cloud?.staff.subject;
                  return <div className="sadhana-admin-access-row" key={inst}>
                    <div><strong>{institutions[inst].name}</strong>
                      <small>{present?'Administrator access granted':'No administrator access'}</small>
                    </div>
                    <button type="button" className={present?'reg-secondary sadhana-revoke-access':'reg-secondary'}
                      disabled={busy||locked} onClick={()=>void applyProfileAccess(inst)}
                      aria-label={`${present?'Revoke':'Grant'} ${institutions[inst].name} administrator access for ${editingUsername}`}>
                      {present?'Revoke':'Grant'}
                    </button>
                  </div>;
                })}
              {admins.find(a=>a.username===editingUsername)?.sub===cloud?.staff.subject&&
                <p className="reg-footnote">Protected Super Admin access cannot be changed.</p>}
            </fieldset>
          </>:dialog==='invite'?<>
            <label className="reg-field"><span>Title</span><select value={title} onChange={e=>setTitle(e.target.value as NameTitle)}>
              {NAME_TITLES.map(t=><option key={t} value={t}>{t||'No title'}</option>)}
            </select></label>
            <label className="reg-field"><span>Full name (without title)</span><input required value={displayName} maxLength={100} onChange={e=>setDisplayName(e.target.value)}/></label>
            <label className="reg-field"><span>Email address</span><input type="email" required value={email} maxLength={254} onChange={e=>setEmail(e.target.value)}/></label>
          </>:<>
            <label className="reg-field"><span>Existing Cognito username</span><input required value={username} maxLength={128} onChange={e=>setUsername(e.target.value)}/></label>
            <label className="reg-field"><span>Access change</span><select value={grant?'grant':'remove'} onChange={e=>setGrant(e.target.value==='grant')}>
              <option value="grant">Grant administrator access</option><option value="remove">Remove administrator access</option>
            </select></label>
          </>}
          {dialog!=='profile'&&<><label className="reg-field"><span>Institution</span><select value={institution} onChange={e=>setInstitution(e.target.value as InstitutionId)}>
            {allowed.map(inst=><option value={inst} key={inst}>{institutions[inst].name}</option>)}
          </select></label>
          <p className="reg-footnote">This changes real Cognito group membership. It does not affect a separate teacher profile. One institution is changed at a time.</p></>}
          {error&&<p className="sadhana-sync-error" role="alert">{error}</p>}
          <div className="reg-modal-actions"><button type="button" className="reg-secondary" disabled={busy} onClick={()=>setDialog(null)}>Cancel</button>
            <button type="submit" className="reg-primary" disabled={busy}>{busy?'Working…':dialog==='profile'?'Save Profile':dialog==='invite'?'Send Invitation':'Apply Access'}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
