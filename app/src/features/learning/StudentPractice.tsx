import {useEffect,useState} from 'react';
import {Image as ImageIcon,Music2,Video} from 'lucide-react';
import type {PracticeMediaFiles,PracticeMediaSlot,StudentPortalContext} from './useStudentPortalController';

const slots:Array<{key:PracticeMediaSlot;label:string;accept:string;icon:typeof ImageIcon}>=[
 {key:'image1',label:'Image 1',accept:'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif',icon:ImageIcon},
 {key:'image2',label:'Image 2',accept:'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif',icon:ImageIcon},
 {key:'audio',label:'Audio',accept:'audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav',icon:Music2},
 {key:'video',label:'Video',accept:'video/mp4,video/quicktime,video/3gpp,.mp4,.mov,.3gp',icon:Video},
];

function PracticeMediaPicker({files,setFile,disabled,onInvalid}:{files:PracticeMediaFiles;setFile:(slot:PracticeMediaSlot,file:File|null)=>void;disabled:boolean;onInvalid:(message:string)=>void}){
 const [previews,setPreviews]=useState<Partial<Record<PracticeMediaSlot,string>>>({});
 const [unpreviewable,setUnpreviewable]=useState<Partial<Record<PracticeMediaSlot,boolean>>>({});
 useEffect(()=>{
  const urls:Partial<Record<PracticeMediaSlot,string>>={};
  for(const {key} of slots){const file=files[key];if(file)urls[key]=URL.createObjectURL(file);}
  setPreviews(urls);setUnpreviewable({});
  return ()=>Object.values(urls).forEach(url=>url&&URL.revokeObjectURL(url));
 },[files]);
 return <section className="v1376-practice-media" aria-label="Practice media">
  <div className="v1376-practice-media-heading"><div><strong>Media</strong></div></div>
  <div className="v1376-practice-media-grid">{slots.map(({key,label,accept,icon:Icon})=>{
   const file=files[key];const preview=previews[key];const id=`practice-media-${key}`;
   return <div className={`v1376-practice-media-tile${file?' has-file':''}`} key={key}>
    <input id={id} className="v1376-practice-media-input" type="file" accept={accept} disabled={disabled} aria-label={`${file?'Replace':'Choose'} ${label.toLowerCase()}`} onChange={event=>{const next=event.currentTarget.files?.[0]||null;if(next){const mime=practiceMime(next);const limit=mime.startsWith('image/')?5_000_000:mime.startsWith('audio/')?20_000_000:100_000_000;if(next.size<1||next.size>limit)onInvalid(`Choose ${label.toLowerCase()} media within its size limit.`);else setFile(key,next)}event.currentTarget.value=''}}/>
    <label htmlFor={id} className={`v1376-practice-media-picker${disabled?' is-disabled':''}`} title={file?`Replace ${label.toLowerCase()}`:`Choose ${label.toLowerCase()}`}>
     {preview&&key.startsWith('image')&&!unpreviewable[key]?<img className="v1376-practice-media-thumbnail" src={preview} alt="" onError={()=>setUnpreviewable(old=>({...old,[key]:true}))}/>:<span className="v1376-practice-media-icon"><Icon size={34} strokeWidth={1.8}/></span>}
     <strong>{label}</strong>
    </label>
    {file&&key==='audio'&&<div className="v1376-practice-media-preview"><audio controls preload="none" src={preview}/></div>}
    {file&&key==='video'&&<div className="v1376-practice-media-preview"><video controls preload="metadata" playsInline src={preview}/></div>}
   </div>;
  })}</div>
 </section>;
}

function practiceMime(file:File){
 if(file.type)return file.type;
 const ext=file.name.split('.').pop()?.toLowerCase();
 return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',mp4:'video/mp4',mov:'video/quicktime','3gp':'video/3gpp'} as Record<string,string>)[ext||'']||'';
}

export function StudentPractice({context}:{context:StudentPortalContext}) {
const {uploadBusy,uploadEvidence,media,detail,edit,setEdit,todayUK,classId,setClassId,date,setDate,minutes,setMinutes,topic,setTopic,notes,setNotes,savePractice,practiceMediaFiles,setPracticeMediaFile,pendingPracticeMediaId,setError} = context;
return (<section className="v1376-practice-page"><div className="v1376-practice-heading"><div><h3>Log practice</h3><p>Keep track of your daily learning, one session at a time.</p></div></div>{!detail.classes.length&&<p role="status">Practice logging is available after joining a class.</p>}<form onSubmit={e=>void savePractice(e)} className="access-practice-form sv1276-practice-form"><label>Class <select required value={classId} onChange={e=>setClassId(e.target.value)}>{detail.classes.map(c=><option key={c.classId} value={c.classId}>{c.className}</option>)}</select></label><label>Date <input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Minutes <input type="number" min={1} max={1440} required value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><label>Topic <input maxLength={200} required value={topic} onChange={e=>setTopic(e.target.value)}/></label><label>Notes <textarea rows={4} maxLength={1500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional details about today’s practice"/></label><PracticeMediaPicker files={practiceMediaFiles} setFile={setPracticeMediaFile} disabled={uploadBusy} onInvalid={setError}/><button type="submit" disabled={!detail.classes.length||uploadBusy}>{uploadBusy?'Uploading media…':pendingPracticeMediaId?'Retry media upload':edit?'Save correction':'Record practice'}</button>{edit&&<button type="button" onClick={()=>{setEdit(null);setTopic('');setNotes('')}}>Cancel correction</button>}</form><div className="v1376-practice-history-head"><h3>Practice history</h3><span>Your recorded sessions</span></div>
 <div className="access-table-wrap"><table><thead><tr><th>Date</th><th>Topic & media</th><th>Minutes</th><th>Action</th></tr></thead><tbody>{detail.practice.map(r=>{const practiceMedia=(media||[]).filter((m:any)=>m.purpose==='practice'&&m.practiceId===r.id);const hasAudio=practiceMedia.some((m:any)=>m.mime?.startsWith('audio/'));return <tr key={r.id}><td>{r.date}</td><td><div className="v1376-history-topic">{r.topic||'Practice'}{practiceMedia.map((m:any)=>m.mime?.startsWith('image/')?<a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img className="v1376-history-thumbnail" src={m.url} alt={`Practice image from ${r.date}`}/></a>:m.mime?.startsWith('audio/')?<audio key={m.id} controls preload="none" aria-label={`Practice audio from ${r.date}`} src={m.url}/>:m.mime?.startsWith('video/')?<video key={m.id} controls preload="none" playsInline aria-label={`Practice video from ${r.date}`} src={m.url}/>:null)}{!hasAudio&&<label className="v1376-recording-upload" title="Add audio"><Music2 size={20}/><span className="sr-only">Add audio</span><input type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav" disabled={uploadBusy} aria-label="Add audio to practice" onChange={e=>{const f=e.target.files?.[0];if(f)void uploadEvidence(f,'practice',r.id);e.target.value=''}}/></label>}</div></td><td>{r.minutes}{r.teacherComments?.length>0&&<div className="student-teacher-feedback"><strong>Teacher feedback</strong>{r.teacherComments.map(c=><p key={c.id}>{c.comment}</p>)}</div>}</td><td><button type="button" disabled={r.date<todayUK()||!!r.teacherComments?.length} title={r.teacherComments?.length?'Reviewed by teacher; corrections locked':r.date<todayUK()?'Practice date has passed':undefined} onClick={()=>{setEdit({id:r.id,version:r.version});setClassId(r.classId);setDate(r.date);setMinutes(r.minutes);setTopic(r.topic);setNotes(r.comments)}}>Correct</button></td></tr>})}{!detail.practice.length&&<tr><td colSpan={4}>No recorded practice yet.</td></tr>}</tbody></table></div></section>);
}
