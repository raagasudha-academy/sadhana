import {useEffect,useRef,useState} from 'react';
import type {CloudSession} from '../../CloudAuth';
import type {InstitutionId} from '../../types';
import type {PublishedAcademy} from './StudentAcademy';
import type {LearnerPage} from '../../StudentHome';
const practiceUploadMime=(file:File)=>{
 if(file.type)return file.type;
 const ext=file.name.split('.').pop()?.toLowerCase();
 return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',mp4:'video/mp4',mov:'video/quicktime','3gp':'video/3gpp'} as Record<string,string>)[ext||'']||'';
};
const ukClock=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const supportedHomeworkMime=(file:File)=>practiceUploadMime(file);
export type PracticeMediaSlot='image1'|'image2'|'audio'|'video';
export type PracticeMediaFiles=Record<PracticeMediaSlot,File|null>;
export type StudentPortalProps = {
 cloud: CloudSession;
 initialInstitution?: InstitutionId;
 embedded?: boolean;
 page?: LearnerPage;
 selectedStudentId?: string;
 onStudentChange?: (id: string) => void;
 onNavigate?: (page: LearnerPage) => void;
};
export function useStudentPortalController({
                                     cloud,
                                     initialInstitution = 'sruti',
                                     embedded = false,
                                     page,
                                     selectedStudentId,
                                     onStudentChange,
                                     onNavigate,
                                    }: {
 cloud: CloudSession;
 initialInstitution?: InstitutionId;
 embedded?: boolean;
 page?: LearnerPage;
 selectedStudentId?: string;
 onStudentChange?: (id: string) => void;
 onNavigate?: (page: LearnerPage) => void;
}) {

 const [inst,setInst]=useState<InstitutionId>(initialInstitution);
 useEffect(()=>{setInst(initialInstitution)},[initialInstitution]);
 const [tab, setTab] = useState<LearnerPage>('overview');
 useEffect(() => {
  if (!embedded || !page) return;
 const section = (value: LearnerPage): string => {
    if (['classes', 'calendar', 'attendance', 'venues'].includes(value)) return 'classes';
    if (['homework', 'practice'].includes(value)) return 'learning';
    if (value === 'resources') return 'resources';
    if (['profile', 'privacy'].includes(value)) return 'profile';
    return value;
  };
  // Keep a selected contextual tab when the parent switches to its top-level section.
  setTab(current => section(current) === section(page) ? current : page);
}, [embedded, page]);
 const navigateTo = (destination: LearnerPage) => {
  setTab(destination);
  onNavigate?.(destination);
 };
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [familyExpanded,setFamilyExpanded]=useState(false);
 const [accessModalOpen,setAccessModalOpen]=useState(false);
 const [rsvpEditing,setRsvpEditing]=useState(false);
 const [academyMenuOpen,setAcademyMenuOpen]=useState(false);
 const [homeworkDrawerOpen,setHomeworkDrawerOpen]=useState(false);
 const [calendarView,setCalendarView]=useState<'month'|'week'|'list'>('week');
 const [calendarAnchor,setCalendarAnchor]=useState(()=>new Date().toISOString().slice(0,7));
 const [weekAnchor,setWeekAnchor]=useState(()=>new Date().toISOString().slice(0,10));
 const [extras,setExtras]=useState<Awaited<ReturnType<CloudSession['api']['learnerExtras']>>|null>(null);
 const [directory,setDirectory]=useState<Awaited<ReturnType<CloudSession['api']['learnerAcademyDirectory']>>|null>(null);
 const [selectedVenueQuery,setSelectedVenueQuery]=useState('');
  const [approvedStaff,setApprovedStaff]=useState<PublishedAcademy[]>([]);
  const [approvedStaffBusy,setApprovedStaffBusy]=useState(false);
  const [approvedStaffError,setApprovedStaffError]=useState('');
 const [directoryBusy,setDirectoryBusy]=useState(false);
 const [directoryError,setDirectoryError]=useState('');
 const [preferredName,setPreferredName]=useState(''),[contactPhone,setContactPhone]=useState(''),[about,setAbout]=useState('');
 const [uploadBusy,setUploadBusy]=useState(false);
 const [media,setMedia]=useState<Array<{id:string;purpose:string;mime:string;url:string;createdAt:string;practiceId?:string}>>([]);
 const [practiceMediaFiles,setPracticeMediaFiles]=useState<PracticeMediaFiles>({image1:null,image2:null,audio:null,video:null});
 const [pendingPracticeMediaId,setPendingPracticeMediaId]=useState('');
 const setPracticeMediaFile=(slot:PracticeMediaSlot,file:File|null)=>setPracticeMediaFiles(old=>({...old,[slot]:file}));
 const loadExtras=async(id:string)=>{try{const x=await cloud.api.learnerExtras(inst,id);setExtras(x);setPreferredName(x.profile.preferredName);setContactPhone(x.profile.phone);setAbout(x.profile.about);const files=await cloud.api.listLearnerMedia(inst,id);setMedia(files.records)}catch(e){setError(e instanceof Error?e.message:'Unable to load student profile')}};
 const updateProfile=async(e:React.FormEvent)=>{e.preventDefault();if(!activeId||!extras)return;try{await cloud.api.saveLearnerProfile(inst,activeId,{preferredName,phone:contactPhone,about,expectedVersion:extras.profile.version});await loadExtras(activeId);setMessage('Profile preferences saved')}catch(e){setError(e instanceof Error?e.message:'Unable to save profile')}};
 const uploadEvidence=async(file:File,purpose:'profile'|'homework'|'practice',practiceId?:string):Promise<boolean>=>{if(!activeId)return false;const mime=practiceUploadMime(file);if(purpose==='practice'){const limits:Record<string,number>={'image/jpeg':5_000_000,'image/png':5_000_000,'image/webp':5_000_000,'image/heic':10_000_000,'image/heif':10_000_000,'audio/mpeg':20_000_000,'audio/mp4':20_000_000,'audio/aac':20_000_000,'audio/wav':20_000_000,'audio/x-wav':20_000_000,'video/mp4':100_000_000,'video/quicktime':100_000_000,'video/3gpp':100_000_000};if(!practiceId||!limits[mime]||file.size>limits[mime]){setError('Choose supported media within the size limit.');return false;}}setUploadBusy(true);setError('');try{const signed=await cloud.api.beginLearnerMedia(inst,activeId,{mime,size:file.size,purpose,...(practiceId?{practiceId}:{})});const r=await fetch(signed.uploadUrl,{method:'PUT',headers:{'Content-Type':mime},body:file});if(!r.ok)throw Error(`Private upload failed (${r.status}). Check bucket CORS and credentials.`);await cloud.api.finishLearnerMedia(inst,activeId,signed.key,purpose);const results=await cloud.api.listLearnerMedia(inst,activeId);setMedia(results.records);if(purpose!=='practice')setMessage('Upload complete.');return true}catch(e){setError(e instanceof Error?e.message:'Unable to upload file');return false}finally{setUploadBusy(false)}};

 const [message,setMessage]=useState('');const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const [students,setStudents]=useState<Array<{id:string;name:string;rollNumber:string;kind:string;relationship?:'self'|'parent'|'child'|'unknown'}>>([]);
 const showFamilyDashboard = new Set(students.map(s=>s.id)).size >= 2;
 const [activeId,setActiveId]=useState('');
 useEffect(()=>{setPracticeMediaFiles({image1:null,image2:null,audio:null,video:null});setPendingPracticeMediaId('')},[activeId,inst]);

 const activeDashboardRef=useRef<{institution:InstitutionId;studentId:string}>({institution:inst,studentId:''});
 useEffect(()=>{setRsvpEditing(false)},[activeId]);
 const [homework,setHomework]=useState<Array<{id:string;classId:string;title:string;instructions:string;dueDate:string;createdAt?:string;completed:boolean;submissionStatus?:'draft'|'submitted'|null;closed?:boolean}>>([]);
 const [selectedHomework,setSelectedHomework]=useState('');
 const [homeworkText,setHomeworkText]=useState('');
 const [submission,setSubmission]=useState<{text:string;status:'draft'|'submitted';version:number;attachmentIds:string[];feedback?:string;reviewedAt?:string|null}|null>(null);
 const [submissionEditable,setSubmissionEditable]=useState(false);
 const [submissionBusy,setSubmissionBusy]=useState(false);
 const [confirmHomework,setConfirmHomework]=useState<{studentId:string;homeworkId:string}|null>(null);
 const [attachments,setAttachments]=useState<Array<{id:string;mime:string;url:string}>>([]);
 const uploadHomeworkFiles=async(files:FileList|null)=>{if(!files||!activeId||!selectedHomework||!submissionEditable||!submission)return;
  const newFiles=Array.from(files);
  const acceptedMime=['image/jpeg','image/png','image/webp'];
  const maxBytes=()=>5_000_000;
  let ids=[...submission.attachmentIds];let selected=attachments.filter(x=>ids.includes(x.id)).map(x=>x.mime);
  const newMimes=newFiles.map(supportedHomeworkMime);
  const nextTypes=[...selected,...newMimes];
  const count=(kind:string)=>nextTypes.filter(x=>x.startsWith(`${kind}/`)).length;
  if(nextTypes.length>3||newFiles.some((x,i)=>!acceptedMime.includes(newMimes[i])||x.size<=0||x.size>maxBytes())){setError('Homework accepts up to 3 JPEG, PNG or WebP images (5 MB each).');return;}
  setSubmissionBusy(true);setError('');try{for(const file of newFiles){
   const mime=supportedHomeworkMime(file);
   const signed=await cloud.api.beginHomeworkEvidence(inst,activeId,selectedHomework,mime,file.size);
   const result=await fetch(signed.uploadUrl,{method:'PUT',headers:{...signed.headers,'Content-Type':mime},body:file});if(!result.ok)throw Error(`Private upload failed (${result.status})`);
   const confirmed=await cloud.api.finishHomeworkEvidence(inst,activeId,selectedHomework,signed.key);ids.push(confirmed.attachmentId);selected.push(mime);setAttachments(a=>[...a,{id:confirmed.attachmentId,mime,url:''}]);
  }setSubmission(old=>old?{...old,attachmentIds:ids}:old);setMessage('Files uploaded. Save your draft or submit to attach them to homework.');}catch(e){setError(e instanceof Error?e.message:'Private media upload failed.');setSubmission(old=>old?{...old,attachmentIds:ids}:old)}finally{setSubmissionBusy(false)}};

 const openAssignment=async(id:string)=>{if(!activeId)return;setConfirmHomework(null);setError('');setSelectedHomework(id);setHomeworkDrawerOpen(true);setSubmission(null);try{const r=await cloud.api.getHomeworkSubmission(inst,activeId,id);setSubmission(r.record);setHomeworkText(r.record.text);setSubmissionEditable(r.editable);setAttachments((await cloud.api.homeworkEvidenceLinks(inst,activeId,id)).records)}catch(e){setError(e instanceof Error?e.message:'Could not load assignment')}};
 const saveAssignment=async(status:'draft'|'submitted')=>{if(!activeId||!submission||!selectedHomework)return;
  if(status==='submitted' && (confirmHomework?.studentId!==activeId || confirmHomework.homeworkId!==selectedHomework))return;
  setConfirmHomework(null);
  setSubmissionBusy(true);setError('');try{const result=await cloud.api.saveHomeworkSubmission(inst,activeId,selectedHomework,{text:homeworkText,status,expectedVersion:submission.version,attachmentIds:submission.attachmentIds});setSubmission(result.record);setMessage(status==='submitted'?'Homework submitted. You may revise it until the due date.':'Draft saved');await loadHomework(activeId)}catch(e){setError(e instanceof Error?e.message:'Could not save homework')}finally{setSubmissionBusy(false)}};
 const [homeworkBusy,setHomeworkBusy]=useState(false);
 const loadHomework=async(id:string)=>{setHomeworkBusy(true);try{const result=await cloud.api.learnerHomework(inst,id);setHomework(result.records)}catch(e){setError(e instanceof Error?e.message:'Unable to load homework')}finally{setHomeworkBusy(false)}};
 const markHomework=async(id:string)=>{if(!activeId)return;setHomeworkBusy(true);try{await cloud.api.completeLearnerHomework(inst,activeId,id);await loadHomework(activeId);setMessage('Homework marked complete')}catch(e){setError(e instanceof Error?e.message:'Unable to save homework')}finally{setHomeworkBusy(false)}};

 const [detailLoading,setDetailLoading]=useState(false);
 const [detail,setDetail]=useState<Awaited<ReturnType<CloudSession['api']['learnerDashboard']>>|null>(null);
 const [edit,setEdit]=useState<{id:string;version:number}|null>(null);
 const [savingRsvp,setSavingRsvp]=useState(false);
 const todayUK=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const canChangeRsvp=(session:{date:string;startTime?:string;status?:string})=>{
  const status=String(session.status||'').toLowerCase();
  if(['cancelled','canceled','deleted'].includes(status)||session.date<todayUK())return false;
  const start=String(session.startTime||'');
  return session.date!==todayUK()||!/^([01]\d|2[0-3]):[0-5]\d/.test(start)||ukClock()<start.slice(0,5);
 };
 const changeRsvp=async(sessionId:string,intention:'attending'|'not_attending'|'unknown')=>{if(!activeId||savingRsvp)return;setSavingRsvp(true);setError('');try{await cloud.api.saveLearnerRsvp(inst,activeId,sessionId,intention);await loadDetail(activeId);setMessage('RSVP saved. Your teacher can see your response.')}catch(e){const message=e instanceof Error?e.message:'RSVP could not be saved';if(message.includes('upcoming classes')){await loadDetail(activeId);setError('RSVP is no longer available for this session. Your class list has been refreshed.')}else setError(message)}finally{setSavingRsvp(false)}};
 const upcomingSessions = detail
   ? Array.from(
     new Map(
       [
        ...(Array.isArray(detail.calendarSessions)
          ? detail.calendarSessions
          : []),
        ...(Array.isArray(detail.nextSessions)
          ? detail.nextSessions
          : []),
       ]
        .filter(s => canChangeRsvp(s))
         .map(s => [s.sessionId, s] as const)
     ).values()
   )
     .sort(
       (a, b) =>
         a.date.localeCompare(b.date) ||
         String(a.startTime || '').localeCompare(
           String(b.startTime || '')
         )
     )
     .slice(0, 6)
   : [];
 const [classId,setClassId]=useState(''),[date,setDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())),[minutes,setMinutes]=useState(15),[topic,setTopic]=useState(''),[notes,setNotes]=useState('');
 const loadDetail=async(id:string)=>{setConfirmHomework(null);setSelectedHomework('');setHomeworkDrawerOpen(false);setSubmission(null);setAttachments([]);setHomeworkText('');setDetailLoading(true);if(id!==activeId)setDetail(null);let timer:ReturnType<typeof setTimeout>|undefined;try{setError('');const result=await Promise.race([cloud.api.learnerDashboard(inst,id),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Student records took too long to load. Please retry or check the Network tab.')),15000)})]);if(timer)clearTimeout(timer);setDetail(result);activeDashboardRef.current={institution:inst,studentId:id};setCalendarAnchor(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).format(new Date()));setActiveId(id);setClassId(result.classes[0]?.classId||'');void loadHomework(id);void loadExtras(id)}catch(e){setError(e instanceof Error?e.message:'Unable to load student dashboard')}finally{if(timer)clearTimeout(timer);setDetailLoading(false)}};
 // The initial family-list effect already fetches the chosen student's dashboard.
 // Wait for it to settle before reacting to explicit View As changes; otherwise
 // both effects can request the same dashboard concurrently.
 useEffect(()=>{
   if(loading || !embedded || !selectedStudentId || detailLoading) return;
   if(!students.some(student=>student.id===selectedStudentId)) return;
   if(selectedStudentId!==activeId) void loadDetail(selectedStudentId);
 },[loading,embedded,selectedStudentId,students,activeId,detailLoading]);
 // Embedded View As selection is owned by App; loading data must never write it back.
 const savePractice=async(e:React.FormEvent)=>{e.preventDefault();if(!activeId)return;setError('');setMessage('');try{let practiceId=pendingPracticeMediaId;if(!practiceId){const saved=await cloud.api.saveLearnerPractice(inst,activeId,{classId,date,minutes,topic,comments:notes},edit||undefined);practiceId=saved.record.id;setPendingPracticeMediaId(practiceId)}const pending=Object.entries(practiceMediaFiles) as [PracticeMediaSlot,File|null][];for(const [slot,file] of pending){if(!file)continue;const ok=await uploadEvidence(file,'practice',practiceId);if(!ok){setMessage('Practice saved. Retry to finish uploading the selected media.');await loadDetail(activeId);return}setPracticeMediaFile(slot,null)}setMessage('Practice saved.');setPendingPracticeMediaId('');setEdit(null);setPracticeMediaFiles({image1:null,image2:null,audio:null,video:null});setTopic('');setNotes('');await loadDetail(activeId)}catch(e){setError(e instanceof Error?e.message:'Unable to save practice')}};
 const [rollNumber,setRollNumber]=useState('');const [kind,setKind]=useState<'student'|'guardian'>('guardian');const [requestBusy,setRequestBusy]=useState(false);

 useEffect(()=>{
   let live=true;
   setLoading(true);
   setError('');
   cloud.api.myLinkedStudents(inst).then(async r=>{
     if(!live)return;
     const records=r.records;
     setStudents(records);
     if(!embedded)setTab('overview');
     const initial=embedded&&selectedStudentId?records.find(x=>x.id===selectedStudentId):records.find(x=>x.id===selectedStudentId)||records[0];
     if(!initial){
       // A successful empty list is authoritative for this academy.
       setDetail(null);setActiveId('');setExtras(null);setMedia([]);
       activeDashboardRef.current={institution:inst,studentId:''};
       return;
     }
     const sameStudent=activeDashboardRef.current.institution===inst && activeDashboardRef.current.studentId===initial.id;
     if(!sameStudent){
       // Never show another student's data while a new selection loads.
       setDetail(null);setExtras(null);setMedia([]);setActiveId('');
     }
     try{
       const dashboard=await cloud.api.learnerDashboard(inst,initial.id);
       if(!live)return;
       setDetail(dashboard);
       activeDashboardRef.current={institution:inst,studentId:initial.id};
       setCalendarAnchor(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).format(new Date()));
       setActiveId(initial.id);
       setClassId(dashboard.classes[0]?.classId||'');
       if(!sameStudent){void loadHomework(initial.id);void loadExtras(initial.id)}
     }catch(e){if(live)setError(e instanceof Error?e.message:'Unable to load student dashboard')}
   }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Unable to load your students')})
     .finally(()=>{if(live)setLoading(false)});
   return()=>{live=false};
 },[cloud.api,inst]);
  useEffect(()=>{if(tab!=='teachers')return;let live=true;setApprovedStaffBusy(true);setApprovedStaffError('');setApprovedStaff([]);void Promise.allSettled((['sruti','raaga'] as const).map(async institution=>{const linked=await cloud.api.myLinkedStudents(institution);const approved=linked.records[0];if(!approved)return null;const result=await cloud.api.learnerAcademyDirectory(institution,approved.id);return {institution,teachers:result.teachers,administrators:result.administrators} as PublishedAcademy;})).then(results=>{if(!live)return;const rows=results.filter((r):r is PromiseFulfilledResult<PublishedAcademy|null>=>r.status==='fulfilled').map(r=>r.value).filter((r):r is PublishedAcademy=>r!==null);setApprovedStaff(rows);if(results.some(r=>r.status==='rejected'))setApprovedStaffError('Some academy staff could not be loaded. Please retry.');}).finally(()=>{if(live)setApprovedStaffBusy(false)});return()=>{live=false};},[cloud.api,cloud.staff.subject,tab]);
 useEffect(()=>{if(!activeId||tab!=='venues'){return;}let live=true;setDirectory(null);setDirectoryError('');setDirectoryBusy(true);cloud.api.learnerAcademyDirectory(inst,activeId).then(r=>{if(live)setDirectory(r)}).catch(e=>{if(live)setDirectoryError(e instanceof Error?e.message:'Directory unavailable')}).finally(()=>{if(live)setDirectoryBusy(false)});return()=>{live=false};},[cloud,inst,activeId,tab]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(requestBusy)return;setError('');setMessage('');const roll=rollNumber.trim();if(students.some(s=>s.rollNumber===roll)){setMessage('You already have approved access to this student in the selected academy.');return}setRequestBusy(true);try{const result=await cloud.api.requestStudentLinkByRoll(inst,roll,kind);if(result.status==='approved')setMessage('You already have approved access to this student.');else if(!result.submitted&&result.status==='pending')setMessage('Your request is already awaiting administrator review.');else setMessage('Request submitted for independent administrator verification. Access has not been granted.');setRollNumber('');setAccessModalOpen(false)}catch(e){const msg=e instanceof Error?e.message:'Unable to submit request';setError(msg.includes('Provide student record ID')?'The live API is still using the old student-ID validator. Redeploy the v12.7.4+ backend code, then retry.':msg)}finally{setRequestBusy(false)}};
 
return {cloud,initialInstitution,embedded,page,selectedStudentId,onStudentChange,onNavigate,inst,setInst,tab,setTab,navigateTo,sidebarOpen,setSidebarOpen,familyExpanded,setFamilyExpanded,accessModalOpen,setAccessModalOpen,rsvpEditing,setRsvpEditing,academyMenuOpen,setAcademyMenuOpen,homeworkDrawerOpen,setHomeworkDrawerOpen,calendarView,setCalendarView,calendarAnchor,setCalendarAnchor,weekAnchor,setWeekAnchor,extras,setExtras,directory,setDirectory,selectedVenueQuery,setSelectedVenueQuery,approvedStaff,setApprovedStaff,approvedStaffBusy,setApprovedStaffBusy,approvedStaffError,setApprovedStaffError,directoryBusy,setDirectoryBusy,directoryError,setDirectoryError,preferredName,setPreferredName,contactPhone,setContactPhone,about,setAbout,uploadBusy,setUploadBusy,media,setMedia,practiceMediaFiles,setPracticeMediaFile,pendingPracticeMediaId,loadExtras,updateProfile,uploadEvidence,students,setStudents,showFamilyDashboard,activeId,setActiveId,homework,setHomework,selectedHomework,setSelectedHomework,homeworkText,setHomeworkText,submission,setSubmission,submissionEditable,setSubmissionEditable,submissionBusy,setSubmissionBusy,confirmHomework,setConfirmHomework,attachments,setAttachments,uploadHomeworkFiles,openAssignment,saveAssignment,homeworkBusy,setHomeworkBusy,loadHomework,markHomework,detailLoading,setDetailLoading,detail,setDetail,edit,setEdit,savingRsvp,setSavingRsvp,todayUK,canChangeRsvp,changeRsvp,upcomingSessions,classId,setClassId,date,setDate,minutes,setMinutes,topic,setTopic,notes,setNotes,loadDetail,savePractice,rollNumber,setRollNumber,kind,setKind,requestBusy,setRequestBusy,message,setMessage,error,setError,loading,setLoading,submit};
}
export type StudentPortalContext = ReturnType<typeof useStudentPortalController>;
