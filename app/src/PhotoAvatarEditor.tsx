import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Camera,ImageUp,X} from 'lucide-react';
import type {SadhanaApiClient} from './api/sadhanaClient';
import {jpegData} from './ProfilePhotoUpload';

type Props={
  api:SadhanaApiClient;
  onUploaded:(url:string)=>void;
  children:ReactNode;
  administratorUsername?:string;
  teacherId?:string;
  label?:string;
};

/** Avatar-triggered, accessible photo editor. Same S3 API and client image limits as inline upload. */
export default function PhotoAvatarEditor({api,onUploaded,children,administratorUsername,teacherId,label='profile photo'}:Props){
  const trigger=useRef<HTMLButtonElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const dialog=useRef<HTMLElement>(null);
  const [open,setOpen]=useState(false);
  const [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const close=()=>{
    if(busy)return;
    setOpen(false);setPreview('');setError('');
    if(input.current)input.current.value='';
    trigger.current?.focus();
  };
  useEffect(()=>{
    if(!open)return;
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busy){event.preventDefault();close();}
      if(event.key!=='Tab')return;
      const controls=dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if(!controls?.length)return;
      const first=controls[0];
      const last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return ()=>document.removeEventListener('keydown',onKeyDown);
  },[open,busy]);
  useEffect(()=>{if(open)input.current?.focus();},[open]);

  const choose=async(file:File|undefined)=>{
    if(!file)return;
    setError('');setPreview('');setBusy(true);
    try{setPreview(await jpegData(file));}
    catch(error){setError(error instanceof Error?error.message:'Could not prepare this image.');}
    finally{setBusy(false);}
  };
  const save=async()=>{
    if(!preview||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      const base64=preview.split(',')[1]||'';
      const result=administratorUsername
        ?await api.uploadAdministratorPhoto(administratorUsername,base64)
        :teacherId?await api.uploadTeacherPhoto(teacherId,base64)
        :await api.uploadMyPhoto(base64);
      onUploaded(result.photoUrl);
      setMessage('Profile photo updated.');
      // Complete the edit and return keyboard focus to the avatar.
      setOpen(false);setPreview('');
      if(input.current)input.current.value='';
      trigger.current?.focus();
    }catch(error){setError(error instanceof Error?error.message:'Photo upload failed.');}
    finally{setBusy(false);}
  };

  return <>
    <button ref={trigger} type="button" className="sadhana-avatar-photo-trigger"
      aria-label={`Change ${label}`} title={`Change ${label}`} onClick={()=>{setMessage('');setOpen(true);}}>
      <span className="sadhana-avatar-photo-face">{children}</span>
      <span className="sadhana-avatar-photo-camera" aria-hidden="true"><Camera size={16}/></span>
    </button>
    <span className="sadhana-photo-visually-hidden" role="status">{message}</span>
    {open&&createPortal(
      <div className="sadhana-avatar-photo-backdrop" onMouseDown={event=>{
        if(event.target===event.currentTarget)close();
      }}>
        <section ref={dialog} className="sadhana-avatar-photo-dialog" role="dialog"
          aria-modal="true" aria-labelledby="sadhana-photo-dialog-title"
          aria-describedby="sadhana-photo-dialog-help">
          <div className="sadhana-avatar-photo-heading">
            <div><h2 id="sadhana-photo-dialog-title">Change profile photo</h2>
              <p id="sadhana-photo-dialog-help">JPG, PNG or WebP · maximum 5 MB</p></div>
            <button type="button" className="sadhana-avatar-photo-close" disabled={busy}
              onClick={close} aria-label="Close photo editor"><X size={19}/></button>
          </div>
          <div className="sadhana-avatar-photo-preview">
            {preview?<img src={preview} alt="New photo preview"/>:
              <span className="sadhana-avatar-photo-original">{children}</span>}
          </div>
          <p className="sadhana-avatar-photo-hint">Your photo will be centre-cropped into a square and compressed automatically.</p>
          <label className="sadhana-avatar-photo-choose">Choose image
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp"
              disabled={busy} onChange={event=>void choose(event.currentTarget.files?.[0])}/>
          </label>
          {error&&<p className="sadhana-sync-error" role="alert">{error}</p>}
          <div className="sadhana-avatar-photo-actions">
            <button type="button" className="reg-secondary" disabled={busy} onClick={close}>Cancel</button>
            <button type="button" className="reg-primary" disabled={!preview||busy}
              onClick={()=>void save()}><ImageUp size={17}/>{busy?'Working…':'Save photo'}</button>
          </div>
        </section>
      </div>,document.body
    )}
  </>;
}
