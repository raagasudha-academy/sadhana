/** Crops and compresses locally before the authenticated Sadhana API receives the photo. */
import {useRef,useState} from 'react';
import {Camera,ImageUp} from 'lucide-react';
import type {SadhanaApiClient} from './api/sadhanaClient';

const ALLOWED=new Set(['image/jpeg','image/png','image/webp']);

export async function jpegData(file:File):Promise<string>{
  if(!ALLOWED.has(file.type))throw new Error('Choose a JPG, PNG or WebP image.');
  if(file.size>5*1024*1024)throw new Error('Choose an image smaller than 5 MB.');
  const source=URL.createObjectURL(file);
  try{
    const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=()=>reject(new Error('Could not open this image.'));
      el.src=source;
    });
    if(img.naturalWidth<32||img.naturalHeight<32||img.naturalWidth>8000||img.naturalHeight>8000)
      throw new Error('Choose an image between 32 and 8000 pixels on each side.');
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=512;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Image editing is unavailable in this browser.');
    const edge=Math.min(img.naturalWidth,img.naturalHeight);
    context.drawImage(img,(img.naturalWidth-edge)/2,(img.naturalHeight-edge)/2,edge,edge,0,0,512,512);
    for(const quality of [0.85,0.72,0.55,0.42]){
      const output=canvas.toDataURL('image/jpeg',quality);
      if(output.length<290000)return output;
    }
    throw new Error('This image could not be compressed enough. Try a different one.');
  }finally{URL.revokeObjectURL(source);}
}

export default function ProfilePhotoUpload({api,onUploaded,administratorUsername}:{
  api:SadhanaApiClient;
  onUploaded:(url:string)=>void;
  administratorUsername?:string;
}){
  const field=useRef<HTMLInputElement>(null);
  const [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const choose=async(file:File|undefined)=>{
    if(!file)return;
    setError('');setSuccess('');setPreview('');
    setBusy(true);
    try{setPreview(await jpegData(file));}
    catch(e){setError(e instanceof Error?e.message:'Cannot read image.');}
    finally{setBusy(false);}
  };
  const save=async()=>{
    if(!preview||busy)return;
    setBusy(true);setError('');setSuccess('');
    try{
      const base64=preview.split(',')[1]||'';
      const result=administratorUsername
        ?await api.uploadAdministratorPhoto(administratorUsername,base64)
        :await api.uploadMyPhoto(base64);
      onUploaded(result.photoUrl);
      setSuccess('Photo saved securely.');
      setPreview('');
      if(field.current)field.current.value='';
    }catch(e){setError(e instanceof Error?e.message:'Photo upload failed.');}
    finally{setBusy(false);}
  };
  return <div className="sadhana-photo-upload">
    <div className="sadhana-photo-upload-row">
      <div className="sadhana-photo-upload-preview" aria-label="Photo preview">
        {preview?<img src={preview} alt="New portrait preview"/>:<Camera size={24} aria-hidden="true"/>}
      </div>
      <div className="sadhana-photo-upload-tools">
        <strong>{administratorUsername?'Administrator portrait':'Your profile photo'}</strong>
        <p>JPG, PNG or WebP, up to 5 MB. Automatically centre-cropped and compressed.</p>
        <input ref={field} type="file" accept="image/jpeg,image/png,image/webp"
          aria-label="Choose a profile photo" disabled={busy}
          onChange={e=>void choose(e.currentTarget.files?.[0])}/>
        <button type="button" className="reg-secondary" disabled={!preview||busy} onClick={()=>void save()}>
          <ImageUp size={16}/>{busy?'Working…':'Upload photo'}
        </button>
      </div>
    </div>
    {error&&<p className="sadhana-sync-error" role="alert">{error}</p>}
    {success&&<p className="reg-success" role="status">{success}</p>}
  </div>;
}
