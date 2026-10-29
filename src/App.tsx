import './v1296SharedShell.css';
import './roleWorkspace.css';
import StudentHome from './StudentHome';
import './v1298LearnerContent.css';
import FeesComingSoon from './features/sadhanaCoreStarter/FeesComingSoon';
import {teacherIdentityFailureMessage} from './teacherIdentityMessages';
import './sessionFooter.css';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen,
  CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, Clock3, ClipboardCheck, FileBarChart2, FileText, Filter,
  GraduationCap, Home, Info, LayoutDashboard, List, MapPin, Menu, MessageCircle,
  Music2, Flower2, Plus, Search, Settings2, ShieldCheck, Sparkles, TrendingUp, RefreshCw,
  UserRound, UsersRound, X, Trash2, Link2,
} from 'lucide-react';
import { institutions } from './institutions';
import { scheduleAttentionIssues } from './scheduleAttention';
import TeacherManagement from './TeacherManagement';
import AdminManagement from './AdminManagement';
import AccountAccess from './AccountAccess';
import PhotoAvatarEditor from './PhotoAvatarEditor';
import AcademyOperations from './AcademyOperations';
import PersistentRegistration from './PersistentRegistration';
import LiveDashboard from './LiveDashboard';
import WebsiteRegistrations from './WebsiteRegistrations';
import { Inbox } from 'lucide-react';
import { ClassFormDialog, VenueFormDialog, VenueManager } from './ClassManagement';
import { initialFamilies, initialMembers, initialEnrolments, getEnrolmentStatus } from './registry';
import PracticeModule from './PracticeModule';
import AcademyBrandIcon from './AcademyBrandIcon';
import MonthCalendar from './MonthCalendar';
import type { CloudSession } from './CloudAuth';
import { LogOut } from 'lucide-react';
import { reportForStudent, aggregate, weeksWindow } from './practiceMath';
import type { InstitutionId, ClassRecord } from './types';
import { adminPages, calendarScopes, filterCalendarResponses, needsAcademySelection } from './workspacePolicy';

const ICONS = {
  Dashboard: LayoutDashboard,
  Students: UsersRound,
  'Families & Students': UsersRound,
  'Classes & Timetable': CalendarDays,
  'My Classes': CalendarDays,
  'My Students': UsersRound,
  'Practice & Reports': FileBarChart2,
  Communications: MessageCircle,
  Venues: MapPin,
  Settings: Settings2,
  Teachers: UserRound,
  Administrators: ShieldCheck,
  'Website Registrations': Inbox,
  'Account Access': ShieldCheck,
  Fees: FileText,
  'My classes': BookOpen,
  'Timetable & calendar': CalendarDays,
  Homework: FileText,
  Practice: FileBarChart2,
  Attendance: CheckCircle2,
  'My teachers': UsersRound,
  'My venues': MapPin,
  'My profile': UserRound,
  'Privacy & consents': ShieldCheck,
};
const learnerPageMap:Record<string,import('./StudentHome').LearnerPage>={
  'Dashboard':'overview','My classes':'classes','Timetable & calendar':'calendar',
  'Homework':'homework','Practice':'practice','Attendance':'attendance',
  'My teachers':'teachers','My venues':'venues','My profile':'profile',
  'Privacy & consents':'privacy'
};
const dayLabel = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ukToday = () => {
  const parts = Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(`${obj.year}-${obj.month}-${obj.day}T12:00:00Z`);
};
const addDays = (date, days) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; };
const mondayOf = (date) => addDays(date, -(date.getUTCDay() + 6) % 7);
const ukDate = (date: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(date);
const displayTime = (s) => {
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const getSessions = (classes, start) => classes.map((c) => {
  const date = addDays(start, (c.day + 6) % 7);
  const status = 'Scheduled';
  return { ...c, date, dateISO:date.toISOString().slice(0,10), status };
}).filter(c=>!c.archived && (!c.startDate||c.dateISO>=c.startDate)&&(!c.endDate||c.dateISO<=c.endDate)).sort((a, b) => a.date.getTime() - b.date.getTime() || a.time.localeCompare(b.time));
const pct = (n) => n == null ? '—' : `${n}%`;
function Pill({ children, tone = 'neutral' }: any) { return <span className={`pill pill-${tone}`}>{children}</span>; }
function MiniIcon({ type = 'neutral' }: any) { return <span className={`notice-icon notice-${type}`}>{type === 'warning' ? <CircleAlert size={17}/> : <CheckCircle2 size={17}/>}</span>; }
function PageHeader({ kicker, title, description, right }: any) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{right && <div className="heading-actions">{right}</div>}</div>;
}
function Metric({ icon: Icon, label, value, delta, tone, periodWeeks=4 }: any) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={19}/></span></div><div className="metric-value">{value}</div><div className="metric-foot">{delta ? <><TrendingUp size={13} /> {delta}</> : 'No records imported'} <span className="quiet">{tone || `· last ${periodWeeks} weeks`}</span></div></div>;
}
function BarTrend({ data }: any) {
  return <div className="trend-chart"><div className="chart-guides"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="trend-weeks" style={{gridTemplateColumns:`repeat(${data.length},minmax(0,1fr))`}}>{data.map((d) => <div className="trend-week" key={d.w}><div className="bar-region"><div className="bar bar-practice" style={{ height: `${d.p}%` }} title={`Practice ${d.p}%`}/><div className="bar bar-submission" style={{ height: `${d.s}%` }} title={`Submission ${d.s}%`}/></div><span>{d.w}</span></div>)}</div></div>;
}
function EmptyState({ title = 'Nothing to show here', detail = 'Try changing your filters.' }: any) { return <div className="empty-state"><Search size={25}/><strong>{title}</strong><span>{detail}</span></div>; }
function Score({ value }: any) { return <span className={`score ${value !== null && value < 50 ? 'score-low' : ''}`}>{pct(value)}</span>; }

function Dashboard({ workspace, isTeacher, onOpenStudent, onChangePage, onSelectInstitution, allClasses, members, enrolments, practiceLogs }: any) {
  const isCombined = workspace === 'combined';
  const [periodWeeks,setPeriodWeeks]=useState<4|8|12>(4);
  const classes = allClasses.filter(c => !c.archived && (isCombined || c.institution === workspace));
  const classIds=new Set(classes.map(c=>c.id));
  const today=ukToday().toISOString().slice(0,10);
  const activePairs=[...new Map<string,{institution:InstitutionId;id:string;classId:string}>(enrolments.filter(e=>classIds.has(e.classId)&&getEnrolmentStatus(e)==='Active').filter(e=>!members.find(m=>m.id===e.studentId)?.archived).map(e=>[`${e.institution}:${e.studentId}`,{institution:e.institution,id:e.studentId,classId:e.classId}] as [string,{institution:InstitutionId;id:string;classId:string}])).values()];
  const period=weeksWindow(periodWeeks);
  const reportRows=(from,to,pairs=activePairs)=>pairs.map(pair=>reportForStudent(pair.id,pair.institution,from,to,enrolments,allClasses,practiceLogs));
  const total=aggregate(reportRows(period.from,period.to));
  const currentStudents=activePairs.map((entry,i)=>{const m=members.find(x=>x.id===entry.id);const r=reportForStudent(entry.id,entry.institution,period.from,period.to,enrolments,allClasses,practiceLogs);return {...entry,name:m?.name||entry.id,initials:(m?.name||'ST').split(' ').map(x=>x[0]).slice(0,2).join(''),status:'Active',practice:r.practiceRate,submission:r.submissionRate,minutes:r.minutes,missingDays:r.missing,notes:[],contact:''};});
  const attention=currentStudents.filter(s => (s.practice!==null&&s.practice<50)||s.missingDays>=2);
  const chart=Array.from({length:periodWeeks},(_,i)=>{const start=addDays(mondayOf(ukToday()),(i-periodWeeks+1)*7),end=addDays(start,6);const sub=aggregate(reportRows(start.toISOString().slice(0,10),end.toISOString().slice(0,10)));return {w:`Week ${i+1}`,p:sub.practiceRate??0,s:sub.submissionRate??0};});
  const classStats=(c:ClassRecord)=>{const ids=[...new Set<string>(enrolments.filter(e=>e.classId===c.id&&getEnrolmentStatus(e)==='Active').map(e=>e.studentId))];return {students:ids.length,...aggregate(ids.map(id=>reportForStudent(id,c.institution,period.from,period.to,enrolments,allClasses,practiceLogs)))};};
  return <>
    <style>{sadhanaMasterDeleteStyles}</style>
    <PageHeader kicker={isTeacher ? 'MY TEACHING SPACE' : 'PERFORMANCE OVERVIEW'} title={isTeacher ? 'Your teaching, at a glance' : isCombined ? 'Both academies, one overview' : `${institutions[workspace].name} overview`} description={isTeacher ? 'Your assigned classes, student progress and upcoming sessions.' : isCombined ? 'A shared overview for administrators across both academies. Select an academy to manage its records.' : `Practice, participation and class performance across the last ${periodWeeks} weeks.`} right={<label className="date-chip" aria-label="Reporting period"><CalendarDays size={15}/><select value={periodWeeks} onChange={e=>setPeriodWeeks(Number(e.target.value) as 4|8|12)} aria-label="Reporting period"><option value={4}>Last 4 weeks</option><option value={8}>Last 8 weeks</option><option value={12}>Last 12 weeks</option></select><ChevronDown size={14}/></label>}/>
    <div className="stat-grid">
      <Metric periodWeeks={periodWeeks} icon={UsersRound} label={isTeacher ? 'My active students' : 'Active students'} value={new Set(currentStudents.map(s=>s.id)).size} delta="No enrolments imported" />
      <Metric periodWeeks={periodWeeks} icon={Activity} label="Practice rate" value={pct(total.practiceRate)} delta="Submitted expected days" />
      <Metric periodWeeks={periodWeeks} icon={ClipboardCheck} label="Submission rate" value={pct(total.submissionRate)} delta="Expected practice days" />
      <Metric periodWeeks={periodWeeks} icon={CalendarDays} label={isTeacher ? 'My classes' : 'Active classes'} value={classes.length} delta="Regular timetables" />
    </div>
    <div className="dashboard-two">
      <section className="surface chart-surface"><div className="surface-heading"><div><h2>Practice performance</h2><p>Weekly trends · awaiting practice records</p></div><div className="legend"><span><i className="dot practice-dot"/> Practice</span><span><i className="dot submission-dot"/> Submissions</span></div></div>{activePairs.length?<BarTrend data={chart}/>:<EmptyState title="No practice information yet" detail="Practice trends will appear after enrolments and logs are connected."/>}</section>
      <section className="surface upcoming-surface"><div className="surface-heading"><div><h2>Upcoming classes</h2><p>Regular weekly sessions</p></div>{isCombined ? <span className="quiet">Select an academy to open its timetable</span> : <button className="text-button" onClick={() => onChangePage(isTeacher ? 'My Classes' : 'Classes & Timetable')}>View timetable <ArrowRight size={14}/></button>}</div>
        <div className="upcoming-list">{classes.slice(0, 4).map(c => <div className="upcoming-row" key={c.id}><div className="day-tile"><strong>{dayLabel[c.day].slice(0,3)}</strong><span>{displayTime(c.time).replace(' ', '\n')}</span></div><div className="row-main"><strong>{c.name}</strong><small>{c.mode === 'Online' ? 'Online' : c.venue}</small></div><Pill tone={c.mode === 'Online' ? 'violet' : 'green'}>{c.mode}</Pill></div>)}{!classes.length&&<EmptyState title="No class records yet" detail="Import classes before activity can be shown here."/>}</div>
      </section>
    </div>
    {isCombined ? <div className="institution-cards">{Object.entries(institutions).map(([key, inst]) => <section className="surface institution-summary" key={key}><div className="institution-label"><span className={`institution-symbol ${key}`} >{key === 'raaga' ? <Music2 size={19}/> : <BookOpen size={19}/>}</span><div><h2>{inst.name}</h2><p>{inst.descriptor}</p></div></div><div className="institution-numbers"><div><strong>{allClasses.filter(c => c.institution === key && !c.archived).length}</strong><span>Classes</span></div><div><strong>{new Set(currentStudents.filter(s=>s.institution===key).map(s=>s.id)).size}</strong><span>Active students</span></div><div><strong>{attention.filter(s=>s.institution===key).length}</strong><span>Need attention</span></div></div><div className="institution-actions"><button className="text-button" type="button" onClick={()=>onSelectInstitution(key)}>Manage {inst.name} <ArrowRight size={14}/></button></div></section>)}</div> : <section className="surface comparison-surface"><div className="surface-heading"><div><h2>Class performance comparison</h2><p>Practice rates across assigned classes</p></div><Pill>Last {periodWeeks} weeks</Pill></div><div className="comparison-list">{classes.map(c => <div key={c.id} className="comparison-row"><div className="comparison-name"><strong>{c.name}</strong><span>{classStats(c).students} students</span></div><div className="progress"><span style={{ width: `${classStats(c).practiceRate??0}%` }}/></div><span className="comparison-rate">{pct(classStats(c).practiceRate)}</span></div>)}{!classes.length&&<EmptyState title="No class comparisons available" detail="Class records have not been imported."/>}</div></section>}
    <section className="surface attention-surface"><div className="surface-heading"><div><h2>Students needing attention</h2><p>Low practice or missing submissions</p></div><Pill tone={attention.length ? 'amber' : 'green'}>{attention.length} flagged</Pill></div><div className="attention-rows">{attention.length ? attention.map(s => <button className="attention-row" key={`${s.id}-${s.institution}`} onClick={() => onOpenStudent(s)}><span className="avatar avatar-small">{s.initials}</span><span className="row-main"><strong>{s.name}</strong><small>{allClasses.find(c => c.id === s.classId)?.name} · {institutions[s.institution].name}</small></span><span className="attention-reason">{s.practice!==null&&s.practice<50 ? 'Low practice' : `${s.missingDays} missing submissions`}</span><Score value={s.practice}/><ArrowRight size={16}/></button>) : <EmptyState title="No students currently flagged" detail="No students are enrolled yet."/>}</div></section>
    <p className="under-content-note"><Info size={14}/> Family, student, class and practice data have not been imported. The academy calendar is connected to AWS. Student and practice records are not imported.</p>
  </>;
}

function Students({ workspace, isTeacher, filter, setFilter, search, setSearch, onOpenStudent, allClasses }: any) {
  const students: any[] = []; // Teacher assignments and student directory are not yet connected.
  const visible = students.filter(s => filter === 'All' ? s.status !== 'Archived' : s.status === filter).filter(s => `${s.name} ${s.id} ${allClasses.find(c => c.id === s.classId)?.name}`.toLowerCase().includes(search.toLowerCase()));
  const tabs = isTeacher ? ['Active', 'Upcoming'] : ['All', 'Active', 'Upcoming', 'Archived'];
  return <>
    <PageHeader kicker={isTeacher ? 'MY STUDENTS' : 'STUDENT MANAGEMENT'} title={isTeacher ? 'Students in your class' : 'Families & Students'} description={isTeacher ? 'View the students assigned to your teaching classes.' : 'Browse active and upcoming learners in this institution.'} right={<Pill tone="green">Awaiting import</Pill>}/>
    <section className="surface directory-surface"><div className="directory-toolbar"><div className="tablist" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={t === filter} className={`tab ${t===filter?'active':''}`} onClick={() => setFilter(t)}>{t}</button>)}</div><div className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students..." aria-label="Search students"/></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Class</th><th>Status</th><th>Practice</th><th>Submissions</th><th aria-label="Details"/></tr></thead><tbody>{visible.map(s => <tr key={`${s.institution}-${s.id}`}><td><button className="student-link" onClick={()=>onOpenStudent(s)}><span className="avatar avatar-small">{s.initials}</span><span><strong>{s.name}</strong><small>{s.id}</small></span></button></td><td>{allClasses.find(c => c.id === s.classId)?.name}</td><td><Pill tone={s.status === 'Active'?'green':s.status === 'Upcoming'?'violet':'neutral'}>{s.status}</Pill></td><td><Score value={s.practice}/></td><td><Score value={s.submission}/></td><td><button className="icon-only" aria-label={`Open ${s.name}`} onClick={()=>onOpenStudent(s)}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table>{!visible.length && <EmptyState/>}</div>
      <div className="table-footer">Showing {visible.length} of {students.length} student records <span>Archived enrolments are administrator-only</span></div></section>
  </>;
}

function ClassCalendar({ classes, start, sessions, onSession }: any) {
  const days = Array.from({length:7}, (_,i) => addDays(start, i));
  return <div className="calendar-scroll"><div className="week-grid">{days.map((date, i) => <div className="week-col" key={i}><div className="week-head"><span>{ukDate(date, { weekday: 'short'})}</span><strong>{date.getUTCDate()}</strong></div><div className="week-slot">{sessions.filter(s => s.date.getTime() === date.getTime()).map(s => <button key={s.id} className={`calendar-event ${s.institution} ${s.status === 'Cancelled' ? 'event-cancelled' : ''}`} onClick={()=>onSession(s)}><strong>{s.allDay?'All day':displayTime(s.time)}</strong><span>{s.name}</span><small>{s.status === 'Cancelled' ? 'Cancelled' : s.mode}</small>{s.attentionItems?.length>0&&<span className="sadhana-record-alert sadhana-calendar-alert" role="img" aria-label={`Needs attention: ${s.attentionItems.join('; ')}`} title={s.attentionItems.join(' · ')}><CircleAlert size={16}/></span>}</button>)}{!sessions.some(s => s.date.getTime()===date.getTime()) && <span className="no-class">—</span>}</div></div>)}</div></div>;
}
function teacherNameKey(name:string):string {
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .trim().replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i,'')
  .replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function matchingRegistryTeacher<T extends {id:string;displayName:string}>(name:string, teachers:T[]):T|undefined {
 const key=teacherNameKey(name);
 const matches=key?teachers.filter(t=>teacherNameKey(t.displayName)===key):[];
 return matches.length===1?matches[0]:undefined;
}
function ManagedEvents({cloud,workspace,isTeacher,venues,onChanged,openRequest,onClose}:any){
 const allowed=(cloud?.staff.institutions||[]).filter((i:string)=>i==='sruti'||i==='raaga');
 const [institution,setInstitution]=useState<string>('');
 const selectedInstitution=workspace==='sruti'||workspace==='raaga'?workspace:institution;
 const [teachers,setTeachers]=useState<any[]>([]);
 const [teacherId,setTeacherId]=useState('');
 // v13.7.7 teacher calendar verified identity
 const [calendarTeacherIdentity,setCalendarTeacherIdentity]=useState<{linked:boolean;teacherId?:string}|null>(null);
 const [calendarIdentityLoading,setCalendarIdentityLoading]=useState(false);
 const [calendarIdentityError,setCalendarIdentityError]=useState('');
 const [teacherPickerOpen,setTeacherPickerOpen]=useState(false);
 const [editing,setEditing]=useState<any>(null);
 const [name,setName]=useState('');const [programme,setProgramme]=useState('');const [eventKind,setEventKind]=useState('recurring');
 const sharedEvent=eventKind==='event';
 const [recurringUntil,setRecurringUntil]=useState('');
 const [repeatFrequency,setRepeatFrequency]=useState('weekly');const [repeatInterval,setRepeatInterval]=useState(1);
 const [repeatDays,setRepeatDays]=useState<number[]>([]);const [repeatEndMode,setRepeatEndMode]=useState('date');
 const [repeatCount,setRepeatCount]=useState(12);const [recurringPreview,setRecurringPreview]=useState<any>(null);
 const [date,setDate]=useState(ukToday().toISOString().slice(0,10));
 const [startTime,setStartTime]=useState('10:00');const [endTime,setEndTime]=useState('11:00');
 const [mode,setMode]=useState('In person');const [venueId,setVenueId]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [venueRows,setVenueRows]=useState<any[]>([]);
 useEffect(()=>{
  if(!isTeacher||!openRequest||!cloud||!selectedInstitution){
   setCalendarTeacherIdentity(null);setCalendarIdentityLoading(false);setCalendarIdentityError('');return;
  }
  let active=true;
  setCalendarTeacherIdentity(null);setCalendarIdentityLoading(true);setCalendarIdentityError('');
  void cloud.api.myTeacherIdentity(selectedInstitution).then((identity:{linked:boolean;teacherId?:string})=>{
   if(!active)return;
   setCalendarTeacherIdentity(identity);
   if(identity.linked&&identity.teacherId)setTeacherId(identity.teacherId);
   else setCalendarIdentityError('Your login is not linked to an active registered teacher for this academy.');
  }).catch((error:unknown)=>{
   if(active){setCalendarTeacherIdentity(null);setCalendarIdentityError(error instanceof Error?error.message:'Unable to verify teacher identity.');}
  }).finally(()=>{if(active)setCalendarIdentityLoading(false);});
  return()=>{active=false;};
 },[isTeacher,openRequest,cloud?.api,cloud?.staff.subject,selectedInstitution]);

 useEffect(()=>{if(!openRequest||!cloud)return;const directoryInstitution=selectedInstitution||(sharedEvent?allowed[0]:'');if(!directoryInstitution)return;let active=true;
  cloud.api.listTeachers(directoryInstitution).then((r:any)=>{if(active)setTeachers(r.records.filter((t:any)=>t.active));}).catch((e:Error)=>{if(active)setError(e.message);});
  cloud.api.list('venues',directoryInstitution).then((r:any)=>{if(active)setVenueRows(r.records||[]);}).catch((e:Error)=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[cloud?.api,selectedInstitution,sharedEvent,openRequest]);
 useEffect(()=>{if(!openRequest)return;const entry=openRequest.record||null;
  setEditing(entry);setInstitution(entry?.institution||'');setName(entry?.name||'');setProgramme(entry?.eventKind==='event'?'Event':entry?.programme||(!entry&&workspace==='raaga'?'Singing':!entry&&workspace==='sruti'?'Vedam':''));setEventKind(entry?.eventKind||(!entry?(isTeacher?'class':'recurring'):entry?.programme==='Event'?'event':'class'));setRecurringUntil('');setRepeatFrequency('weekly');setRepeatInterval(1);setRepeatEndMode('date');setRepeatCount(12);setRepeatDays([new Date(`${entry?.date||ukToday().toISOString().slice(0,10)}T12:00:00Z`).getUTCDay()]);setRecurringPreview(null);
  setDate(entry?.date||ukToday().toISOString().slice(0,10));setStartTime(entry?.startTime||'10:00');
  setEndTime(entry?.endTime||'11:00');setMode(entry?.mode||'In person');setVenueId(entry?.venueId||'');
  setTeacherId(entry?.teacherId||'');setTeacherPickerOpen(false);setError('');
 },[openRequest]);
 useEffect(()=>{setRecurringPreview(null);},[name,programme,teacherId,mode,venueId,date,startTime,endTime,selectedInstitution]);
 if(!openRequest||!cloud)return null;
 const locations=venueRows.length?venueRows:venues||[];
 const chosenVenue=locations.find((v:any)=>v.id===venueId);
 const eventOnline=sharedEvent&&venueId==='online';
 const save=async()=>{setBusy(true);setError('');try{
  // These checks are intentionally shared by Preview and Save. Custom teacher buttons
  // cannot rely on native HTML `required` validation.
  if(!['recurring','class','event'].includes(eventKind))throw Error('Choose a calendar entry type.');
  if(!name.trim())throw Error('Enter a class or event name.');
  if(sharedEvent){
   if(!allowed.includes('raaga')||!allowed.includes('sruti')||isTeacher)throw Error('Shared events require administrator access to both academies.');
   if(programme!=='Event')throw Error('Event programme must be Event.');
  } else {
   if(!selectedInstitution||!allowed.includes(selectedInstitution))throw Error('Choose an authorised academy.');
   const validProgrammes=selectedInstitution==='raaga'?['Singing']:['Vedam','Vedanta'];
   if(!validProgrammes.includes(programme))throw Error(`Choose a valid ${selectedInstitution==='raaga'?'Raagasudha':'Sruti'} programme.`);
   if(!['In person','Online'].includes(mode))throw Error('Choose a delivery mode.');
   if(!isTeacher&&!teacherId)throw Error('Choose a registered teacher.');
   if(!isTeacher&&!teachers.some((t:any)=>t.id===teacherId))throw Error('Choose an active teacher from the directory.');
   if(isTeacher){
    if(calendarIdentityLoading)throw Error('Teacher identity verification is still in progress.');
    if(!calendarTeacherIdentity?.linked||!calendarTeacherIdentity.teacherId)throw Error(calendarIdentityError||'Your login must be linked to an active registered teacher.');
    if(editing?.teacherId&&editing.teacherId!==calendarTeacherIdentity.teacherId)throw Error('You cannot modify a calendar entry assigned to another teacher.');
   }
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))throw Error('Choose a valid class or event date.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endTime<=startTime)throw Error('Choose a start and end time; the end must be later than the start.');
  if(sharedEvent){if(!eventOnline&&!chosenVenue)throw Error('Choose a saved venue or Online.');}
  else if(mode!=='Online'&&!chosenVenue)throw Error('Choose a venue from the directory.');
  if(eventKind==='recurring'){
   if(!['daily','weekly','monthly'].includes(repeatFrequency)||!Number.isInteger(repeatInterval)||repeatInterval<1||repeatInterval>4)throw Error('Choose a valid repeat frequency and interval.');
   if(repeatFrequency==='weekly'&&(!repeatDays.length||repeatDays.some((d:number)=>!Number.isInteger(d)||d<0||d>6)))throw Error('Select at least one weekday.');
   if(repeatEndMode==='date'){
    if(!recurringUntil||recurringUntil<date||!Number.isFinite(Date.parse(recurringUntil+'T12:00:00Z')))throw Error('Choose a last class date on or after the first class date.');
   } else if(repeatEndMode==='count'){
    if(!Number.isInteger(repeatCount)||repeatCount<1||repeatCount>80)throw Error('Enter a number of sessions between 1 and 80.');
   } else throw Error('Choose when the recurring class ends.');
  }
   if(eventKind==='recurring'){
    if(isTeacher)throw Error('Recurring class creation requires academy administrator access.');
    if(!selectedInstitution||!teacherId)throw Error('Choose an academy and registered teacher.');
    if(mode!=='Online'&&!chosenVenue)throw Error('Choose a venue.');
    const recurrence={frequency:repeatFrequency,interval:repeatInterval,weekdays:repeatFrequency==='weekly'?repeatDays:undefined,endMode:repeatEndMode,until:repeatEndMode==='date'?recurringUntil:undefined,count:repeatEndMode==='count'?repeatCount:undefined};
    const draft={name,programme,teacherId,mode,location:mode==='Online'?'Online':chosenVenue.name,venueId:mode==='Online'?'':chosenVenue.id,date,startTime,endTime,recurrence};
    if(!recurringPreview){const result=await cloud.api.previewRecurringClass(selectedInstitution,draft);setRecurringPreview(result);return;}
    await cloud.api.createRecurringClass(selectedInstitution,draft);await onChanged();onClose();return;
   }
  if((sharedEvent&&!eventOnline&&!chosenVenue)||(eventKind!=='event'&&mode!=='Online'&&!chosenVenue))throw Error('Choose a venue from the directory or Online.');
  const payload={name,programme:eventKind==='event'?'Event':programme,eventKind,date,startTime,endTime,
   mode:eventKind==='event'?'Event':mode,location:eventOnline||(!sharedEvent&&mode==='Online')?'Online':chosenVenue?.name||'',
   venueId:eventOnline||(!sharedEvent&&mode==='Online')?'':chosenVenue?.id||'',
   ...(eventKind==='event'||isTeacher?{}:{teacherId})};
  if(sharedEvent){
   if(editing&&editing.sharedEvent)await cloud.api.updateSharedEvent(editing.id,payload,editing.version);
   else if(editing)throw Error('An older academy-only event cannot be converted to shared in place. Create a new shared event.');
   else await cloud.api.createSharedEvent(payload);
  }else{
   if(editing&&editing.sharedEvent)throw Error('A shared event cannot become a class.');
   if(editing)await cloud.api.updateManagedEvent(selectedInstitution,editing.id,payload,editing.version);
   else await cloud.api.createManagedEvent(selectedInstitution,payload);
  }
  await onChanged();onClose();
 }catch(e){setError(e instanceof Error?e.message:'Unable to save event.');}finally{setBusy(false);}};
 const cancel=async()=>{if(!editing||!window.confirm('Cancel this event? It will remain in history.'))return;setBusy(true);try{
  if(editing.sharedEvent)await cloud.api.cancelSharedEvent(editing.id,editing.version);
  else await cloud.api.cancelManagedEvent(selectedInstitution,editing.id,editing.version);
  await onChanged();onClose();
 }catch(e){setError(e instanceof Error?e.message:'Unable to cancel event.');}finally{setBusy(false);}};
 return <div className="reg-shade"><style>{`
  .sadhana-calendar-entry-modal .sadhana-edit-field select {
    -webkit-appearance: none;
    appearance: none;
    padding-right: 54px !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2355667e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 24px center;
    background-size: 18px 18px;
  }

  /* Match recurrence selection typography to the rest of the Sadhana modal. */
  .sadhana-calendar-entry-modal .sadhana-recurrence-days {
    min-width: 0;
    margin: 0;
    padding: 12px 14px 14px;
    border: 1px solid #dbe2eb;
    border-radius: 10px;
  }
  .sadhana-calendar-entry-modal .sadhana-recurrence-days legend {
    padding: 0 6px;
    color: #293950;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 600;
  }
  .sadhana-calendar-entry-modal .sadhana-recurrence-weekdays {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sadhana-calendar-entry-modal .sadhana-weekday {
    width: 42px;
    height: 36px;
    padding: 0;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #fff;
    color: #293950;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
  }
  .sadhana-calendar-entry-modal .sadhana-weekday.selected {
    background: #e5edff;
    border-color: #9daed2;
    color: #293950;
  }
  .sadhana-calendar-entry-modal .sadhana-weekday:focus-visible {
    outline: 2px solid #91a5d1;
    outline-offset: 2px;
  }
  /* Required indicators: visual only; existing validation remains authoritative. */
  .sadhana-calendar-entry-modal .sadhana-required-label::after {
    content: ' *';
    color: #dc2626;
    font-weight: 800;
    font-size: 15px;
  }
  .sadhana-calendar-entry-modal .sadhana-required-note {
    margin: 0 0 4px;
    font-size: 12px;
    color: #64748b;
  }
  .sadhana-calendar-entry-modal .sadhana-required-note strong { color: #dc2626; }
  .sadhana-calendar-entry-modal .sadhana-edit-field select:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`}</style><section className="reg-modal sadhana-calendar-entry-modal" role="dialog" aria-modal="true" aria-label="Manage calendar event">
  <div className="reg-modal-head"><h2>{editing?'Edit calendar event':'Add Event'}</h2><button className="reg-icon-btn" type="button" onClick={onClose}><X size={18}/></button></div>
  <form className="reg-form" onSubmit={e=>{e.preventDefault();void save();}}>
  <p className="sadhana-required-note"><strong>*</strong> Required fields</p>
    <label className="sadhana-edit-field">
      <span>Calendar entry type</span>
      <select
        required
        value={eventKind}
        disabled={!!editing}
        onChange={e => {
          const kind = e.target.value;
          setEventKind(kind);
          setProgramme(
            kind === 'event'
              ? 'Event'
              : selectedInstitution === 'raaga'
                ? 'Singing'
                : selectedInstitution === 'sruti'
                  ? 'Vedam'
                  : ''
          );
          setError('');
        }}
      >
        <option value="recurring">New recurring class</option>
        <option value="class">Compensation class</option>
        <option value="event">Event</option>
      </select>
    </label>
    {!sharedEvent&&<label className="sadhana-edit-field"><span className={!selectedInstitution ? "sadhana-required-label" : undefined}>Academy</span><select required value={selectedInstitution} disabled={workspace!=='combined'||!!editing} onChange={e=>{setInstitution(e.target.value);setTeacherId('');setTeacherPickerOpen(false);setVenueId('');setProgramme(eventKind==='event'?'Event':e.target.value==='raaga'?'Singing':e.target.value==='sruti'?'Vedam':'');setError('');}}>
   <option value="">Choose academy</option>{allowed.map((i:string)=><option key={i} value={i}>{institutions[i].name}</option>)}</select></label>}
  {sharedEvent&&<p className="reg-footnote">This event appears in both Raagasudha and Sruti calendars. Changes and cancellation apply to both.</p>}
  <label className="sadhana-edit-field"><span className="sadhana-required-label">Event / class name</span><input required value={name} onChange={e=>setName(e.target.value)}/></label>
  <label className="sadhana-edit-field"><span>Programme</span><select required disabled={eventKind==='event'||!selectedInstitution} value={eventKind==='event'?'Event':programme} onChange={e=>setProgramme(e.target.value)}>
   {eventKind==='event'?<option value="Event">Event</option>:selectedInstitution==='raaga'?<option value="Singing">Singing</option>:selectedInstitution==='sruti'?<><option value="Vedam">Vedam</option><option value="Vedanta">Vedanta</option></>:<option value="">Choose academy first</option>}
  </select></label>
  <label className="sadhana-edit-field"><span>{eventKind==='recurring'?'First class date':'Date'}</span><input type="date" required value={date} onChange={e=>{setDate(e.target.value);setRecurringPreview(null);if(eventKind==='recurring')setRepeatDays([new Date(`${e.target.value}T12:00:00Z`).getUTCDay()]);}}/></label>
   {eventKind==='recurring'&&<div style={{display:'grid',gap:12,fontSize:14}}>
    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
     <span style={{fontSize:14,fontWeight:500,color:'#293950'}}>Repeat every</span>
     <select required aria-label="Repeat interval" value={repeatInterval} onChange={e=>{setRepeatInterval(Number(e.target.value));setRecurringPreview(null);}} style={{width:72,minHeight:38,padding:'7px 26px 7px 12px',fontSize:14,borderRadius:9,border:'1px solid #cbd5e1'}}>{[1,2,3,4].map(n=><option value={n} key={n}>{n}</option>)}</select>
     <select required aria-label="Repeat frequency" value={repeatFrequency} onChange={e=>{setRepeatFrequency(e.target.value);setRecurringPreview(null);}} style={{width:124,minHeight:38,padding:'7px 30px 7px 12px',fontSize:14,borderRadius:9,border:'1px solid #cbd5e1'}}><option value="daily">day(s)</option><option value="weekly">week(s)</option><option value="monthly">month(s)</option></select>
    </div>
    {repeatFrequency==='weekly'&&<div><span style={{display:'block',marginBottom:8,fontSize:14,fontWeight:500,color:'#293950'}}>Repeat on</span><div role="group" aria-label="Repeat on weekdays" style={{display:'flex',gap:7,flexWrap:'wrap'}}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,j)=>{const i=(j+1)%7;return <button key={d} type="button" aria-label={d} aria-pressed={repeatDays.includes(i)} aria-required={repeatFrequency==='weekly'} onClick={()=>{setRepeatDays(v=>v.includes(i)?v.filter(x=>x!==i):[...v,i]);setRecurringPreview(null);}} style={{border:'1px solid #cbd5e1',borderRadius:22,minWidth:45,minHeight:34,padding:'6px 9px',fontSize:13,fontWeight:600,background:repeatDays.includes(i)?'#e5edff':'white',color:'#263952',cursor:'pointer'}}>{d}</button>;})}</div></div>}
    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
     <span style={{fontSize:14,fontWeight:500,color:'#293950'}}>Until</span>
     <select required aria-label="Recurrence ends" value={repeatEndMode} onChange={e=>{setRepeatEndMode(e.target.value);setRecurringPreview(null);}} style={{width:158,minHeight:38,padding:'7px 30px 7px 12px',fontSize:14,borderRadius:9,border:'1px solid #cbd5e1'}}><option value="date">On a date</option><option value="count">After sessions</option></select>
     {repeatEndMode==='date'?<><span className="sadhana-required-label" style={{fontSize:13,color:'#293950'}}>Last class date</span><input aria-label="Last class date (inclusive)" type="date" required min={date} value={recurringUntil} onChange={e=>{setRecurringUntil(e.target.value);setRecurringPreview(null);}} style={{minHeight:38,flex:'1 1 175px',minWidth:175,fontSize:14,borderRadius:9,border:'1px solid #cbd5e1'}}/></>:<input aria-label="Number of sessions (maximum 80)" type="number" required min="1" max="80" value={repeatCount} onChange={e=>{setRepeatCount(Number(e.target.value));setRecurringPreview(null);}} style={{width:90,minHeight:38,fontSize:14,borderRadius:9,border:'1px solid #cbd5e1'}}/>}
    </div>
    {recurringPreview&&<div role="status" style={{border:'1px solid #d8e1ed',borderRadius:12,padding:'14px 16px',background:'#f7f9fc',color:'#293950',fontSize:14,lineHeight:1.5}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:8}}><strong style={{fontSize:14,fontWeight:650}}>Review class schedule</strong><span style={{fontSize:12,fontWeight:600,padding:'4px 9px',background:'#e8eef9',borderRadius:999}}>{recurringPreview.count} {recurringPreview.count===1?'session':'sessions'}</span></div><div style={{display:'flex',flexWrap:'wrap',gap:'6px 8px',maxHeight:116,overflowY:'auto'}}>{recurringPreview.dates.map((d:string)=><span key={d} style={{display:'inline-block',border:'1px solid #d9e1ed',borderRadius:7,background:'white',padding:'5px 9px',fontSize:13}}>{new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'))}</span>)}</div><p style={{fontSize:12,color:'#64748b',margin:'9px 0 0'}}>UK local time · No records are changed during preview</p>{recurringPreview.duplicateNames?.length>0&&<p style={{color:'#a02727',fontSize:13}}>Existing class with the same name: {recurringPreview.duplicateNames.map((x:any)=>x.name).join(', ')}. Rename before saving.</p>}</div>}
    <p className="reg-footnote">Preview is read-only. Confirm creates one master class and all dated sessions together (maximum 80).</p>
   </div>}
  <div className="sadhana-edit-time-row"><label className="sadhana-edit-field"><span>Start time</span><input type="time" required value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label className="sadhana-edit-field"><span>End time</span><input type="time" required value={endTime} onChange={e=>setEndTime(e.target.value)}/></label></div>
  {eventKind!=='event'&&<div className="sadhana-edit-field"><label id="sadhana-event-teacher-label" className="sadhana-required-label">Teacher</label>{isTeacher?<input readOnly value={teachers.find(t=>t.cognitoSub===cloud.staff.subject)?.displayName||editing?.teacher||'Your linked teacher account'}/>:<div style={{position:'relative'}}>
   <button type="button" aria-labelledby="sadhana-event-teacher-label" aria-haspopup="listbox" aria-expanded={teacherPickerOpen} aria-required={true} onClick={()=>setTeacherPickerOpen(v=>!v)} style={{width:'100%',minHeight:44,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 18px',border:'1px solid #cbd5e1',borderRadius:10,background:'#fff',color:teacherId?'#293950':'#69768b',font:'inherit',fontSize:14,textAlign:'left',cursor:'pointer'}}><span>{teachers.find(t=>t.id===teacherId)?.displayName||'Choose teacher'}</span><ChevronDown size={17} style={{flexShrink:0,marginRight:6,transform:teacherPickerOpen?'rotate(180deg)':'none'}}/></button>
   {teacherPickerOpen&&<div role="listbox" aria-labelledby="sadhana-event-teacher-label" tabIndex={0} onKeyDown={e=>{if(e.key==='Escape'){setTeacherPickerOpen(false);e.stopPropagation();}}} style={{maxHeight:196,overflowY:'auto',overscrollBehavior:'contain',WebkitOverflowScrolling:'touch',marginTop:5,background:'#fff',border:'1px solid #cbd5e1',borderRadius:10,boxShadow:'0 6px 18px rgba(20,33,55,.10)'}}>{teachers.map(t=><button key={t.id} role="option" aria-selected={teacherId===t.id} type="button" onClick={()=>{setTeacherId(t.id);setTeacherPickerOpen(false);}} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,textAlign:'left',padding:'10px 16px',background:teacherId===t.id?'#eff4ff':'transparent',border:0,color:'#293950',font:'inherit',fontSize:14,cursor:'pointer'}}><span>{t.displayName}</span>{teacherId===t.id&&<Check size={15}/>}</button>)}{!teachers.length&&<p style={{padding:'10px 16px',margin:0}}>No active teachers available</p>}</div>}
   {!teacherId&&<input tabIndex={-1} aria-hidden="true" required value="" onChange={()=>{}} style={{position:'absolute',width:1,height:1,opacity:0,pointerEvents:'none'}}/>}
   </div>}</div>}
  {eventKind!=='event'&&<label className="sadhana-edit-field"><span>Delivery</span><select required value={mode} onChange={e=>{setMode(e.target.value);setVenueId('');setRecurringPreview(null);}}><option>In person</option><option>Online</option></select></label>}
  {sharedEvent&&<label className="sadhana-edit-field"><span className="sadhana-required-label">Venue</span><select required value={venueId} onChange={e=>setVenueId(e.target.value)}><option value="">Choose venue</option><option value="online">Online</option>{locations.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
  {eventKind!=='event'&&(mode==='Online'?<label className="sadhana-edit-field"><span>Venue</span><input readOnly required value="Online"/></label>:<label className="sadhana-edit-field"><span className="sadhana-required-label">Venue</span><select required value={venueId} onChange={e=>setVenueId(e.target.value)}><option value="">Choose venue</option>{locations.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>)}
  {error&&<p role="alert" className="sadhana-sync-error">{error}</p>}
  <div className="reg-modal-actions"><button type="button" className="reg-secondary" onClick={onClose}>Close</button>{editing&&<button type="button" className="reg-danger" disabled={busy} onClick={()=>void cancel()}>Cancel event</button>}<button type="submit" className="reg-primary" disabled={busy||(!sharedEvent&&!selectedInstitution)||(eventKind==='recurring'&&isTeacher)||(eventKind==='recurring'&&!!recurringPreview?.duplicateNames?.length)||(sharedEvent&&(isTeacher||!allowed.includes('raaga')||!allowed.includes('sruti')))}>{busy?'Saving…':eventKind==='recurring'?(recurringPreview?'Confirm & create class':'Preview class dates'):'Save calendar entry'}</button></div>
  </form></section></div>;
}
const sadhanaMasterDeleteStyles = `
.sadhana-master-delete-link{margin:18px 0 4px;display:flex;justify-content:flex-start}
.sadhana-master-delete-link button{display:inline-flex;align-items:center;gap:8px;font-size:13px!important;width:auto!important}
.sadhana-master-delete-overlay{position:fixed!important;inset:0!important;z-index:10010!important;display:flex!important;align-items:center;justify-content:center;padding:18px;background:rgba(24,36,58,.53)}
.sadhana-master-delete-dialog{width:min(100%,470px)!important;max-height:88vh!important;overflow-y:auto;margin:auto!important;border-radius:16px!important}
.sadhana-master-delete-content{padding:20px;display:grid;gap:14px;font-size:14px}
.sadhana-master-delete-content>strong{overflow-wrap:anywhere;font-size:15px}
.sadhana-master-delete-summary{display:grid;grid-template-columns:1fr auto;gap:9px;background:#f4f6fa;padding:14px;border-radius:10px;color:#65728a}
.sadhana-master-delete-summary strong{color:#2e3a51;text-align:right}
.sadhana-master-delete-content p{display:flex;align-items:flex-start;gap:8px;margin:0;color:#8d3947;font-size:13px;line-height:1.5}
.sadhana-master-delete-content p svg{flex:0 0 auto}
.sadhana-master-delete-content details{font-size:12px;color:#65728a}
.sadhana-master-delete-dates{display:flex;gap:6px;flex-wrap:wrap;max-height:110px;overflow:auto;margin-top:8px}
.sadhana-master-delete-dates span{padding:4px 8px;border-radius:6px;background:#f4f6fa}
.sadhana-master-delete-buttons{display:flex;justify-content:flex-end;gap:9px;padding:16px 20px 20px;border-top:1px solid #edf0f5}
.sadhana-master-delete-buttons button{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:auto!important;padding:9px 14px!important;font-size:13px!important;min-height:39px;margin:0!important}
/* Same-row session actions; compact enough for the details drawer. */
.sadhana-session-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;align-items:stretch!important}
.sadhana-session-actions>button{grid-column:auto!important;min-width:0!important;width:100%!important;margin:0!important;padding:9px 5px!important;min-height:41px!important;font-size:12px!important;white-space:normal!important;line-height:1.25!important;justify-content:center!important;text-align:center!important}
.sadhana-session-actions:not(:has(.reg-danger)){grid-template-columns:repeat(2,minmax(0,1fr))!important}
@media(max-width:370px){.sadhana-session-actions>button{font-size:11px!important;padding:8px 3px!important}}
`;

function Timetable({ workspace, isTeacher, classView, setClassView, onSession, cloud, revision, venues }: any) {
  const [search,setSearch]=useState('');
  const [masterStatusFilter,setMasterStatusFilter]=useState<'all'|'active'|'paused'|'archived'>('all');
  const [lifecycleBusy,setLifecycleBusy]=useState(false);
  const [lifecycleError,setLifecycleError]=useState('');
  const [lifecycleConfirm,setLifecycleConfirm]=useState<null|'paused'|'archived'>(null);
  const [selectedCalendarClass,setSelectedCalendarClass]=useState('');
  const [eventOpen,setEventOpen]=useState<any>(null);
  const [anchor,setAnchor]=useState(ukToday);
  const [records,setRecords]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [apiError,setApiError]=useState('');
  const [refreshCounter,setRefreshCounter]=useState(0);
  const [master,setMaster]=useState<any|null>(null);
  const [editingMaster,setEditingMaster]=useState(false);
  const [classRoster,setClassRoster]=useState<any[]>([]);
  const [classDetailsTab,setClassDetailsTab]=useState<'details'|'roster'>('details');
  const [rosterSearch,setRosterSearch]=useState('');
  const [classRosterError,setClassRosterError]=useState('');
  useEffect(()=>{
    if(!master||!cloud){setClassRoster([]);return;}
    let active=true;setClassRosterError('');setClassRoster([]);
    Promise.all([cloud.api.listOperations('enrolment',master.institution),cloud.api.listOperations('student',master.institution)])
      .then(([enrolments,students])=>{if(!active)return;const memberById=new Map(students.records.map((m:any)=>[m.id,m]));
        setClassRoster(enrolments.records.filter((e:any)=>e.classId===master.id&&!e.archived).map((e:any)=>({enrolment:e,student:memberById.get(e.studentId)})));})
      .catch((error:Error)=>{if(active)setClassRosterError(error.message||'Roster not available for this account.');});
    return()=>{active=false;};
  },[master?.id,cloud?.api]);
  const [masterForm,setMasterForm]=useState<any>({});
  const [seriesFrom,setSeriesFrom]=useState('');
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [masterReview,setMasterReview]=useState(false);
  const [registeredTeachers,setRegisteredTeachers]=useState<Array<{id:string;displayName:string;active:boolean}>>([]);
  useEffect(()=>{
   if(!master||!cloud||isTeacher){setRegisteredTeachers([]);return;}
   let alive=true;
   cloud.api.listTeachers(master.institution).then(result=>{if(alive)setRegisteredTeachers(result.records.filter(t=>t.active));})
    .catch(()=>{if(alive)setRegisteredTeachers([]);});
   return()=>{alive=false;};
  },[master?.id,cloud?.api,isTeacher]);
  const view=classView==='calendar'?'week':classView;
  const start=view==='week'?mondayOf(anchor):new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth(),1,12));
  const rangeStart=view==='week'?start:mondayOf(start);
  const rangeEnd=view==='week'?addDays(start,6):addDays(mondayOf(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12))),6);
  const insts=calendarScopes(workspace, cloud?.staff.institutions ?? []);
  useEffect(()=>{
    let alive=true;
    if(!cloud || insts.length===0){setRecords([]);setLoading(false);return;}
    setRecords([]);setLoading(true);setApiError('');
    Promise.all(insts.map(async (institution) => ({
      institution,
      ...(await cloud.api.listSchedule(institution)),
    })))
      .then((all)=>{if(alive)setRecords(filterCalendarResponses(all,workspace,cloud.staff.institutions));})
      .catch((error:Error)=>{if(alive){setRecords([]);setApiError(error.message.includes('Unknown endpoint')?'The v0.7 calendar API has not yet been deployed.':error.message);}})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[cloud?.api,workspace,revision,refreshCounter]);
  const [assignedTeacherIds,setAssignedTeacherIds]=useState<string[]>([]);
  const [teacherScopeError,setTeacherScopeError]=useState('');
  useEffect(()=>{
    if(!isTeacher||!cloud){setAssignedTeacherIds([]);setTeacherScopeError('');return;}
    let active=true;setAssignedTeacherIds([]);setTeacherScopeError('');
    Promise.all(insts.filter(institution=>institution==='raaga'||institution==='sruti').map(async institution=>({institution,identity:await cloud.api.myTeacherIdentity(institution)})))
      .then(all=>{if(!active)return;
        const linked=all.filter(({identity})=>identity.linked&&identity.teacherId).map(({identity})=>String(identity.teacherId));
        setAssignedTeacherIds([...new Set(linked)]);
        if(!linked.length)setTeacherScopeError('No active registered teacher profile is linked to this login for the selected academy. Ask an administrator to verify your teacher link.');
      })
      .catch((error:unknown)=>{if(active){setAssignedTeacherIds([]);setTeacherScopeError(teacherIdentityFailureMessage(error));}});
    return()=>{active=false;};
  },[isTeacher,cloud?.api,cloud?.staff.subject,workspace]);
  const classes=records.filter(r=>r.recordType==='class'&&(!isTeacher||assignedTeacherIds.includes(r.teacherId)));
  const noLinkedClasses=isTeacher&&!loading&&!apiError&&!teacherScopeError&&assignedTeacherIds.length>0&&classes.length===0;
  const lifecycleByClass=new Map(classes.map((c:any)=>[c.id,c.lifecycleStatus||'active']));
  const currentUkDate=ukToday().toISOString().slice(0,10);
  const activeCalendarRecords=records.filter((r:any)=>{
    // v13.7.7 teacher-owned standalone calendar visibility
    if(isTeacher){
      const linkedToAssignedMaster=classes.some((c:any)=>c.id===(r.recordType==='class'?r.id:r.classId));
      // Standalone dated classes do not have a master classId. They are visible
      // ONLY when the backend record is explicitly attributed to this login's
      // verified teacher registry ID. Never infer ownership from the name.
      const ownStandalone=!!r.managedEvent && !r.classId &&
        assignedTeacherIds.includes(String(r.teacherId||'')) &&
        insts.includes(r.institution);
      if(!linkedToAssignedMaster&&!ownStandalone)return false;
    }
    if(!r.classId)return true;
    const state=lifecycleByClass.get(r.classId);
    return state!=='archived'||(r.date&&r.date<currentUkDate);
  });
  const orderedCalendarClasses=[...classes].sort((a:any,b:any)=>
    String(a.name||'').localeCompare(String(b.name||''),'en-GB') || String(a.institution||'').localeCompare(String(b.institution||'')));
  // A workspace change must not leave an inaccessible class filter selected.
  useEffect(()=>{setSelectedCalendarClass('');},[workspace]);
  const knownVenueIds: ReadonlySet<string> | undefined = venues.length ? new Set<string>(venues.map((v:any)=>String(v.id))) : undefined;
  const classIssueCount=classes.filter(c=>scheduleAttentionIssues(c,knownVenueIds).length>0).length;
  const expand=(record:any)=>{
    const dates:string[]=[];
    if(record.allDay){
      let d=new Date(`${record.date}T12:00:00Z`);
      const limit=new Date(`${record.endDate}T12:00:00Z`);
      for(let count=0;d<limit&&count<400;count++,d=addDays(d,1)){
        const day=d.toISOString().slice(0,10);
        if(day>=rangeStart.toISOString().slice(0,10)&&day<=rangeEnd.toISOString().slice(0,10))dates.push(day);
      }
    }else dates.push(record.date);
    const linkedVenue=venues.find((v:any)=>v.id===record.venueId);
    const attentionItems=scheduleAttentionIssues(record,knownVenueIds);
    return dates.map(day=>({
      venueId:record.venueId,venueAddress:linkedVenue?.address||record.location||'',
      id:record.id+'-'+day,recordId:record.id,expectedVersion:record.version,recordType:record.recordType,classId:record.classId,seriesMasterVersion:classes.find(c=>c.id===record.classId)?.version,
      name:record.name,programme:record.programme,institution:record.institution,dateISO:day,
      date:new Date(`${day}T12:00:00Z`),time:record.allDay?'00:00':record.startTime,endTime:record.endTime,
      duration:record.allDay?0:(Number(record.endTime?.slice(0,2))*60+Number(record.endTime?.slice(3)))-(Number(record.startTime?.slice(0,2))*60+Number(record.startTime?.slice(3))),
      allDay:record.allDay,endDate:record.endDate,teacher:record.teacher||'Not assigned',mode:record.mode||'Event',venue:linkedVenue?.name||record.location||'—',
      status:record.status==='cancelled'?'Cancelled':record.status==='tentative'?'Tentative':'Scheduled',
      studentCount:0,sadhana:true,original:record,attentionItems
    }));
  };
  const openCalendarItem=(s:any)=>s.original?.managedEvent?setEventOpen({record:s.original}):onSession(s);
  const sessions=activeCalendarRecords.filter(r=>r.recordType!=='class').flatMap(expand)
    .filter(s=>s.dateISO>=rangeStart.toISOString().slice(0,10)&&s.dateISO<=rangeEnd.toISOString().slice(0,10))
    .map((s:any)=>lifecycleByClass.get(s.classId)==='paused'&&s.dateISO>=currentUkDate&&s.status==='Scheduled'?{...s,status:'Paused'}:s)
    .sort((a,b)=>a.dateISO.localeCompare(b.dateISO)||a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
  // Display-only filter. All records, master classes and API responses remain untouched.
  const visibleSessions=selectedCalendarClass
    ? sessions.filter((s:any)=>s.classId===selectedCalendarClass)
    : sessions;
  const shift=(dir:number)=>setAnchor((value:Date)=>view==='week'?addDays(value,dir*7):new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+dir,Math.min(value.getUTCDate(),28),12)));
  const rangeLabel=view==='week'?`${ukDate(start,{day:'numeric',month:'short'})} – ${ukDate(addDays(start,6),{day:'numeric',month:'short',year:'numeric'})}`:ukDate(start,{month:'long',year:'numeric'});
  const openMaster=(r:any)=>{setClassDetailsTab('details');setRosterSearch('');setEditingMaster(false);setMasterDeleteReview(null);setMasterDeleteError('');setMasterReview(false);setMaster(r);setMasterForm({name:r.name,teacher:r.teacher,teacherId:r.teacherId||'',programme:r.programme,mode:r.mode,location:r.location,startTime:r.startTime,endTime:r.endTime});setSeriesFrom(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));setSaveError('');};
  const [masterDeleteReview,setMasterDeleteReview]=useState<any>(null);
  const [masterDeleteBusy,setMasterDeleteBusy]=useState(false);
  const [masterDeleteError,setMasterDeleteError]=useState('');
  const reviewMasterDeletion=async()=>{
    if(!cloud||!master||isTeacher)return;
    setMasterDeleteBusy(true);setMasterDeleteError('');
    try{setMasterDeleteReview(await cloud.api.previewDeleteMasterClass(master.institution,master.id,master.version));}
    catch(e){setMasterDeleteError(e instanceof Error?e.message:'Unable to preview class deletion.');}
    finally{setMasterDeleteBusy(false);}
  };
  const confirmMasterDeletion=async()=>{
    if(!cloud||!master||isTeacher||!masterDeleteReview)return;
    setMasterDeleteBusy(true);setMasterDeleteError('');
    try{
      await cloud.api.deleteMasterClass(master.institution,master.id,master.version,masterDeleteReview.signature);
      setMasterDeleteReview(null);setMaster(null);setRefreshCounter(n=>n+1);
    }catch(e){setMasterDeleteReview(null);setMasterDeleteError(e instanceof Error?e.message:'Unable to delete class. Refresh and preview again.');}
    finally{setMasterDeleteBusy(false);}
  };
  const updateLifecycle=async(status:'active'|'paused'|'archived')=>{
    if(!cloud||!master||isTeacher)return;
    setLifecycleBusy(true);setLifecycleError('');
    try{
      await cloud.api.setMasterLifecycle(master.institution,master.id,status,master.version);
      setLifecycleConfirm(null);setMaster(null);setRefreshCounter(n=>n+1);
    }catch(e){setLifecycleError(e instanceof Error?e.message:'Unable to update class status.');}
    finally{setLifecycleBusy(false);}
  };
  const saveMaster=async()=>{
    if(!master||!cloud||isTeacher)return;
    setSaving(true);setSaveError('');
    try{
      const registry=registeredTeachers.find(t=>t.id===masterForm.teacherId)
       || matchingRegistryTeacher(masterForm.teacher||'',registeredTeachers);
      const changed=Object.fromEntries(Object.entries(masterForm).filter(([k,v])=>k!=='teacherId'&&v!==master[k]));
      const seriesChanges=Object.fromEntries(Object.entries(changed).filter(([k])=>['teacher','startTime','endTime'].includes(k)));
      const otherChanges=Object.fromEntries(Object.entries(changed).filter(([k])=>!['teacher','startTime','endTime'].includes(k)));
      if(Object.keys(seriesChanges).length&&Object.keys(otherChanges).length)throw new Error('Save name/programme/location changes separately from teacher/time series changes.');
      if(Object.keys(seriesChanges).length){
        if(seriesChanges.teacher){
          if(!registry||registry.displayName!==masterForm.teacher)throw new Error('Select an active registered teacher.');
          seriesChanges.teacherId=registry.id;
        }
        await cloud.api.updateScheduleSeries(master.institution,master.id,seriesChanges,seriesFrom,master.version);
      }else if(Object.keys(otherChanges).length){
        await cloud.api.updateSchedule(master.institution,master.id,otherChanges,master.version);
      }else if(!master.teacherId&&master.teacher&&registry&&teacherNameKey(registry.displayName)===teacherNameKey(master.teacher)){
        if(!masterReview){setMasterReview(true);return;}
        await cloud.api.linkTeacherIdentity(master.institution,master.id,{teacherId:registry.id,expectedVersion:master.version});
      }else throw new Error('No changes to save. To link an effective-dated assignment, edit a dated session from the calendar.');
      setMaster(null);setRefreshCounter(n=>n+1);
    }catch(e){setSaveError(e instanceof Error?e.message:'Unable to save this class.');}
    finally{setSaving(false);}
  };
  const linkedRegistryTeacher=registeredTeachers.find(t=>t.id===masterForm.teacherId)
   || matchingRegistryTeacher(masterForm.teacher||'',registeredTeachers);
  const baselineLinkOnly=!!master&&!master.teacherId&&!!master.teacher&&!!linkedRegistryTeacher
   &&teacherNameKey(linkedRegistryTeacher.displayName)===teacherNameKey(master.teacher)
   &&Object.entries(masterForm).every(([k,v])=>k==='teacherId'||v===master[k]);
  return <>
    <PageHeader kicker="LIVE" title="Academy Calandar" description={loading?'Loading calendar…':`${records.filter(x=>x.recordType!=='class').length} dated entries · ${classes.length} master classes · ${records.filter(x=>x.recordType==='special-event').length} events`} right={<Pill>Time Zone: Europe/London</Pill>}/>
    {apiError&&<p className="sadhana-sync-error" role="alert">{apiError}</p>}{isTeacher&&teacherScopeError&&<p className="sadhana-sync-error" role="alert">{teacherScopeError}</p>}{noLinkedClasses&&<p className="sadhana-sync-error" role="status">Your teacher login is verified, but no master classes in this academy reference your registered teacher ID. An administrator can review the master-class assignment; existing class records have not been changed.</p>}
    {!loading&&!apiError&&classIssueCount>0&&<p className="sadhana-attention-summary"><CircleAlert size={15}/> {classIssueCount} master class{classIssueCount===1?' needs':'es need'} attention · Select a red icon to see missing details.</p>}
    {!loading&&!apiError&&records.length===0&&<p>No calendar records found for this workspace.</p>}
    <section className="surface calendar-surface"><div className="calendar-toolbar"><div className="week-controls"><button className="icon-button" title="Previous period" onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><div><strong>{rangeLabel}</strong><span>{view==='week'?'Weekly timetable':'Monthly timetable'}</span></div><button className="icon-button" title="Next period" onClick={()=>shift(1)}><ChevronRight size={18}/></button><button className="today-button" onClick={()=>setAnchor(ukToday())}>Today</button></div><div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:12}}><label className="sadhana-calendar-class-filter" style={{display:'inline-flex',alignItems:'center',gap:8,margin:0}}>
  <span style={{fontSize:13,fontWeight:600,color:'#596781',whiteSpace:'nowrap'}}>Class</span>
  <select aria-label="Filter calendar by class" value={selectedCalendarClass} onChange={e=>setSelectedCalendarClass(e.target.value)} style={{appearance:'auto',WebkitAppearance:'menulist',minWidth:170,maxWidth:250,width:'min(31vw,250px)',height:36,padding:'6px 12px',border:'1px solid #cdd6e5',borderRadius:10,background:'#fff',color:'#354765',fontSize:13,fontWeight:500,cursor:'pointer'}}>
    <option value="">All classes &amp; events</option>
    {orderedCalendarClasses.map((c:any)=><option key={`${c.institution}:${c.id}`} value={c.id}>{workspace==='combined'?`${institutions[c.institution]?.name||c.institution} · `:''}{c.name}</option>)}
  </select>
</label><button type="button" onClick={()=>setEventOpen({})} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,padding:'7px 12px',borderRadius:999,border:'1px solid #cdd6e5',background:'#fff',color:'#354765',fontSize:13,fontWeight:600,lineHeight:'20px',cursor:'pointer',whiteSpace:'nowrap'}}><Plus size={14}/> Add Event</button><div className="segmented"><button className={view==='week'?'selected':''} onClick={()=>setClassView('week')}><CalendarDays size={15}/> Week</button><button className={view==='month'?'selected':''} onClick={()=>setClassView('month')}><CalendarDays size={15}/> Month</button><button className={view==='list'?'selected':''} onClick={()=>setClassView('list')}><List size={15}/> List</button></div></div></div>
      {view==='week'?<ClassCalendar classes={classes} start={start} sessions={visibleSessions} onSession={openCalendarItem}/>:view==='month'?<MonthCalendar month={start} sessions={visibleSessions} onSession={openCalendarItem} showTime={(x:string)=>x==='00:00'?'All day':displayTime(x)}/>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Session</th><th>Date & time</th><th>Teacher / Programme</th><th>Mode / Location</th><th>Status</th><th/></tr></thead><tbody>{visibleSessions.map((s:any)=><tr key={s.id}><td><button className="plain-link sadhana-attention-list-name" onClick={()=>openCalendarItem(s)}>{s.name}{s.attentionItems?.length>0&&<span className="sadhana-record-alert" role="img" aria-label={`Needs attention: ${s.attentionItems.join('; ')}`} title={s.attentionItems.join(' · ')}><CircleAlert size={16}/></span>}</button></td><td>{ukDate(s.date,{weekday:'short',day:'numeric',month:'short'})}, {s.allDay?'All day':displayTime(s.time)}</td><td>{s.teacher} · {s.programme}</td><td>{s.venue}{s.venueId&&<small style={{display:'block'}}>{s.venueAddress}</small>}</td><td><Pill tone={s.status==='Cancelled'?'red':'green'}>{s.status}</Pill></td><td><button className="icon-only" onClick={()=>openCalendarItem(s)} aria-label={`View ${s.name}`}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table>{!visibleSessions.length&&<EmptyState title="No sessions this period" detail="Try another month or check that the one-time migration has been applied."/>}</div>}
      <div className="calendar-footer"><span><i className="key-color raaga"/> Raagasudha</span><span><i className="key-color sruti"/> Śruti Vedam</span><span><i className="key-color cancelled"/> Cancelled</span><span>Select any event to view and edit it.</span></div>
    </section>
    <style>{`
/* sadhana-master-status-filter: master-class directory status controls */
.class-roster-list .surface-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.class-roster-list .surface-heading>div:first-child{margin-right:auto}
.sadhana-master-filter-field{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#58677e;white-space:nowrap}
.sadhana-master-status-filter{height:37px;min-width:130px;max-width:165px;border-radius:9px;border:1px solid #d5deea;background:#fff;color:#34445e;font-family:inherit;font-size:12px;font-weight:500;padding:7px 28px 7px 11px;cursor:pointer}
.sadhana-master-status-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:700;line-height:1.2;white-space:nowrap;text-transform:capitalize;background:#e7f4ec;color:#257047;border:1px solid #c3e5ce}
.sadhana-master-status-pill.paused{background:#fff3de;color:#8d621c;border-color:#f1d9ab}
.sadhana-master-status-pill.archived{background:#edf0f5;color:#657186;border-color:#dce2eb}
.class-tile .sadhana-tile-end{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:540px){.sadhana-master-filter-field{width:100%}.sadhana-master-status-filter{flex:1;max-width:none}}
`}</style><section className="surface class-roster-list"><div className="surface-heading"><div><h2>Master class directory</h2><p>Live master classes across in-person and online teaching.</p></div><label className="sadhana-master-filter-field sadhana-master-class-filter"><span>Class</span><select aria-label="Filter master directory by class" value={selectedCalendarClass} onChange={e=>setSelectedCalendarClass(e.target.value)}><option value="">All classes</option>{orderedCalendarClasses.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="sadhana-master-filter-field"><span>Status</span><select className="sadhana-master-status-filter" aria-label="Filter master classes by status" value={masterStatusFilter} onChange={e=>setMasterStatusFilter(e.target.value as 'all'|'active'|'paused'|'archived')}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label><label className="class-list-search"><Search size={15}/><input aria-label="Search classes" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search classes" /></label></div>
    <div className="class-card-grid">{classes.filter(c=>!selectedCalendarClass||c.id===selectedCalendarClass).filter(c=>masterStatusFilter==='all'||(c.lifecycleStatus||'active')===masterStatusFilter).filter(c=>`${c.name} ${c.teacher} ${c.location}`.toLowerCase().includes(search.toLowerCase())).map(c=>{
      const issues=scheduleAttentionIssues(c,knownVenueIds);
      return <button className="class-tile" key={c.id} onClick={()=>openMaster(c)}><span className="tile-top"><span className="class-mark"><GraduationCap size={19}/></span><span className="sadhana-tile-end"><span className={`sadhana-master-status-pill ${c.lifecycleStatus||'active'}`}>{c.lifecycleStatus==='paused'?'Paused':c.lifecycleStatus==='archived'?'Archived':'Active'}</span>{issues.length>0&&<span className="sadhana-record-alert" role="img" aria-label={`Needs attention: ${issues.join('; ')}`} title={issues.join(' · ')}><CircleAlert size={18}/></span>}<ArrowUpRight size={16}/></span></span><strong>{c.name}</strong><small>{displayTime(c.startTime)} – {displayTime(c.endTime)}</small><span className="class-tile-meta">{c.teacher||'Teacher unassigned'} · {c.mode}</span><small>{venues.find((v:any)=>v.id===c.venueId)?.name||c.location}</small><span className="tile-foot">{records.filter(x=>x.classId===c.id).length} sessions <span>View details <ArrowRight size={14}/></span></span></button>;
    })}</div>
    {!classes.length&&<EmptyState title="No master classes imported" detail="They will appear when the one-time import is complete."/>}
    </section>
    <ManagedEvents cloud={cloud} workspace={workspace} isTeacher={isTeacher} venues={venues} openRequest={eventOpen} onClose={()=>setEventOpen(null)} onChanged={async()=>{setRefreshCounter(n=>n+1);}}/>
    {master&&<div className="reg-shade"><section className="reg-modal sadhana-master-editor" role="dialog" aria-modal="true" aria-label={editingMaster?'Edit master class':'Class details'}>
<style>{`
.sadhana-master-editor .sadhana-lifecycle-panel{border:1px solid #dfe5ee;border-radius:12px;padding:16px;margin:18px 0 12px;display:grid;gap:14px;background:#fff}
.sadhana-master-editor .sadhana-lifecycle-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}
.sadhana-master-editor .sadhana-lifecycle-heading strong{font-size:15px;font-weight:700;color:#29364b}
.sadhana-master-editor .sadhana-lifecycle-heading p{font-size:12px;line-height:1.55;color:#697791;margin:5px 0 0}
.sadhana-master-editor .sadhana-lifecycle-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:#eaf0fa;color:#465e89;white-space:nowrap}
.sadhana-master-editor .sadhana-lifecycle-badge.paused{background:#fff3df;color:#8f6220}
.sadhana-master-editor .sadhana-lifecycle-badge.archived{background:#f4e8eb;color:#995060}
.sadhana-master-editor .sadhana-lifecycle-actions{display:flex;gap:8px;flex-wrap:wrap}
.sadhana-master-editor .sadhana-lifecycle-actions button{font-size:12px!important;min-height:36px;padding:8px 13px!important;margin:0!important}
.sadhana-master-editor .sadhana-lifecycle-confirm{display:grid;gap:12px;border-top:1px solid #e7ebf2;padding-top:14px}
.sadhana-master-editor .sadhana-lifecycle-confirm strong{font-size:13px;color:#2d3b50}
.sadhana-master-editor .sadhana-lifecycle-confirm p{font-size:12px;line-height:1.5;color:#697791;margin:5px 0 0}
.sadhana-master-editor .sadhana-lifecycle-confirm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.sadhana-master-editor .sadhana-lifecycle-confirm-actions button{font-size:12px!important;min-height:36px;padding:8px 12px!important;margin:0!important}
.sadhana-master-editor .sadhana-master-footer{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important;margin-top:18px!important;padding-top:16px;border-top:1px solid #e7ebf2}
.sadhana-master-editor .sadhana-master-footer-right{display:flex;gap:8px;margin-left:auto}
.sadhana-master-editor .sadhana-master-footer button{font-size:12px!important;min-height:38px!important;padding:8px 12px!important;margin:0!important;width:auto!important;flex:0 1 auto!important;white-space:nowrap}
@media(max-width:480px){.sadhana-master-editor .sadhana-master-footer>.reg-danger{width:100%!important}.sadhana-master-editor .sadhana-master-footer-right{width:100%;display:grid;grid-template-columns:1fr 1fr}.sadhana-master-editor .sadhana-master-footer-right button{width:100%!important}}
`}</style>
<div className="reg-modal-head"><div><h2>{editingMaster?'Edit master class':'Class details'}</h2><p>{master.name}</p></div><button className="reg-icon-btn" onClick={()=>setMaster(null)} aria-label="Close"><X size={18}/></button></div><div className="sadhana-class-tabs" role="tablist" aria-label="Class details sections"><button type="button" role="tab" aria-selected={classDetailsTab==='details'} onClick={()=>setClassDetailsTab('details')}>Class details</button><button type="button" role="tab" aria-selected={classDetailsTab==='roster'} onClick={()=>setClassDetailsTab('roster')}>Student roster ({classRoster.length})</button></div>{classDetailsTab==='roster'?<section className="sadhana-class-roster" role="tabpanel" aria-label="Class student roster"><input aria-label="Search class roster" placeholder="Search by student or roll number" value={rosterSearch} onChange={e=>setRosterSearch(e.target.value)}/>{classRosterError?<p role="alert">{classRosterError}</p>:<div className="sadhana-roster-scroll"><table><thead><tr><th>Roll number</th><th>Student</th></tr></thead><tbody>{classRoster.filter(({student}:any)=>`${student?.name||''} ${student?.rollNumber||''}`.toLowerCase().includes(rosterSearch.toLowerCase())).map(({enrolment,student}:any)=><tr key={enrolment.id}><td>{student?.rollNumber||'—'}</td><td>{student?.name||'Student record unavailable'}</td></tr>)}</tbody></table>{!classRoster.length&&<p>No current enrolments found.</p>}</div>}</section>:<form className="reg-form" onSubmit={e=>{e.preventDefault();if(editingMaster)void saveMaster();}}>{scheduleAttentionIssues(master,knownVenueIds).length>0&&<div className="sadhana-record-issues" role="note"><CircleAlert size={18}/><div><strong>Class details need attention</strong><ul>{scheduleAttentionIssues(master,knownVenueIds).map(issue=><li key={issue}>{issue}</li>)}</ul><small>Based on saved details. The warning clears after the correction is saved and refreshed.</small></div></div>}{(['name','programme','teacher','mode','location','startTime','endTime'] as const).map(k=><label key={k} className="sadhana-edit-field"><span>{k==='startTime'?'Start time':k==='endTime'?'End time':k}</span>{k==='teacher'&&!isTeacher&&editingMaster?<select aria-label="Assigned registered teacher" value={masterForm.teacherId||matchingRegistryTeacher(masterForm.teacher||'',registeredTeachers)?.id||''} onChange={e=>{const t=registeredTeachers.find(t=>t.id===e.target.value);setMasterReview(false);setMasterForm((v:any)=>({...v,teacher:t?.displayName||'',teacherId:t?.id||''}));}}>
 <option value="">Choose registered teacher</option>
 {registeredTeachers.map(t=><option value={t.id} key={t.id}>{t.displayName}</option>)}
 </select>:<input readOnly={!editingMaster||isTeacher} type={k==='startTime'||k==='endTime'?'time':'text'} maxLength={k==='location'?300:120} value={masterForm[k]||''} onChange={e=>{setMasterReview(false);setMasterForm((v:any)=>({...v,[k]:e.target.value}));}}/>}</label>)}<label className="sadhana-edit-field"><span>Teacher/time changes effective from (UK date)</span><input type="date" value={seriesFrom} onChange={e=>{setMasterReview(false);setSeriesFrom(e.target.value);}} readOnly={!editingMaster||isTeacher}/></label><p className="reg-footnote">Teacher and time changes apply from this date to every future session in this class, including online sessions created later. Name, programme and location changes must be saved separately.</p>{saveError&&<p role="alert" className="sadhana-sync-error">{saveError}</p>}{masterReview&&baselineLinkOnly&&<div className="sadhana-inline-review" role="status"><CircleAlert size={19}/><div><strong>Review teacher link</strong><p>Link {linkedRegistryTeacher?.displayName} to {master.name}? This stores the teacher identity only. No dated sessions or teacher names will change.</p><button type="button" className="sadhana-review-back" onClick={()=>setMasterReview(false)}>Back to editing</button></div></div>}{!isTeacher&&editingMaster&&<section className="sadhana-lifecycle-panel" aria-label="Class lifecycle">
  <div className="sadhana-lifecycle-heading">
    <div><strong>Class lifecycle</strong><p><b>Active</b> — classes run as scheduled. <b>Paused</b> — temporarily on hold; resume when ready. <b>Archived</b> — finished or discontinued; hidden from the active calendar. History is retained.</p></div>
    <span className={`sadhana-lifecycle-badge ${master.lifecycleStatus||'active'}`}>{master.lifecycleStatus||'active'}</span>
  </div>
  <div className="sadhana-lifecycle-actions">
    {master.lifecycleStatus==='paused'||master.lifecycleStatus==='archived'
      ? <button type="button" className="reg-secondary" disabled={lifecycleBusy} onClick={()=>void updateLifecycle('active')}>{master.lifecycleStatus==='archived'?'Restore class':'Resume class'}</button>
      : <button type="button" className="reg-secondary" disabled={lifecycleBusy} onClick={()=>setLifecycleConfirm('paused')}>Pause class</button>}
    {master.lifecycleStatus!=='archived'&&<button type="button" className="reg-secondary" disabled={lifecycleBusy} onClick={()=>setLifecycleConfirm('archived')}>Archive class</button>}
  </div>
  {lifecycleConfirm&&<div className="sadhana-lifecycle-confirm" role="group" aria-label="Confirm class status">
    <div><strong>{lifecycleConfirm==='paused'?'Pause this class?':'Archive this class?'}</strong>
      <p>{lifecycleConfirm==='paused'?'Upcoming sessions will show as paused. Existing records are retained.':'Future sessions will be hidden from the active calendar. You can restore them later.'}</p></div>
    <div className="sadhana-lifecycle-confirm-actions">
      <button type="button" className="reg-secondary" onClick={()=>setLifecycleConfirm(null)} disabled={lifecycleBusy}>Go back</button>
      <button type="button" className="reg-primary" disabled={lifecycleBusy} onClick={()=>void updateLifecycle(lifecycleConfirm)}>{lifecycleBusy?'Saving…':lifecycleConfirm==='paused'?'Confirm pause':'Confirm archive'}</button>
    </div>
  </div>}
  {lifecycleError&&<p role="alert" className="sadhana-sync-error">{lifecycleError}</p>}
</section>}
{masterDeleteError&&<p className="sadhana-sync-error" role="alert">{masterDeleteError}</p>}
 <div className="reg-modal-actions sadhana-master-footer">
  {!isTeacher&&editingMaster&&<button type="button" className="reg-danger" disabled={masterDeleteBusy} onClick={()=>void reviewMasterDeletion()}><Trash2 size={15}/> Delete master class</button>}
  <div className="sadhana-master-footer-right"><button type="button" className="reg-secondary" onClick={()=>setMaster(null)}>Cancel</button>
  {!isTeacher&&!editingMaster&&<button type="button" className="reg-primary" onClick={()=>setEditingMaster(true)}>Edit class</button>}{!isTeacher&&editingMaster&&<button type="submit" className="reg-primary" disabled={saving}>{saving?'Saving…':baselineLinkOnly?(masterReview?'Confirm teacher link':'Review teacher link'):'Save changes'}</button>}</div>
</div><p className="reg-footnote">If the existing name already matches a registered teacher, Save links its identity to this class baseline. Choose a different teacher plus an effective date to change future sessions. For an existing dated rule, open a session in that period.</p></form>}</section></div>}{master&&masterDeleteReview&&<div className="reg-shade sadhana-master-delete-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!masterDeleteBusy)setMasterDeleteReview(null);}}>
 <section className="reg-modal sadhana-master-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="master-delete-title" aria-describedby="master-delete-message">
 <div className="reg-modal-head"><div><h2 id="master-delete-title">Delete master class?</h2><p>Administrator action · Permanent deletion</p></div><button type="button" className="reg-icon-btn" onClick={()=>setMasterDeleteReview(null)} disabled={masterDeleteBusy} aria-label="Close"><X size={18}/></button></div>
 <div className="sadhana-master-delete-content"><strong>{masterDeleteReview.name}</strong><div className="sadhana-master-delete-summary"><span>Master class</span><strong>1</strong><span>Scheduled sessions</span><strong>{masterDeleteReview.sessionCount}</strong><span>Recurring rules</span><strong>{masterDeleteReview.ruleCount}</strong></div>
 <p id="master-delete-message"><CircleAlert size={17}/> This removes the master class, all its listed dated sessions and recurring rules. It cannot be undone.</p>
 {masterDeleteReview.dates.length>0&&<details><summary>View session dates</summary><div className="sadhana-master-delete-dates">{masterDeleteReview.dates.map((d:string,i:number)=><span key={d+i}>{d}</span>)}</div></details>}
 </div><div className="sadhana-master-delete-buttons"><button type="button" className="reg-secondary" disabled={masterDeleteBusy} onClick={()=>setMasterDeleteReview(null)}>Keep class</button><button type="button" className="reg-danger" disabled={masterDeleteBusy} onClick={()=>void confirmMasterDeletion()}><Trash2 size={15}/>{masterDeleteBusy?'Deleting…':'Delete class & sessions'}</button></div>
 </section></div>}

  </>;
}
function CommsPage({ workspace }: any) {
  return <><PageHeader kicker="COMMUNICATIONS" title="Communications" description="A future home for WhatsApp delivery records, announcements and failed messages."/><div className="feature-grid"><section className="surface feature-card"><div className="feature-icon"><MessageCircle size={22}/></div><h2>Message history</h2><p>Review sent, delivered and failed messages for your institution.</p><Pill>Phase 5</Pill></section><section className="surface feature-card"><div className="feature-icon"><CircleAlert size={22}/></div><h2>Failed messages</h2><p>Investigate failures and choose whether to resend manually.</p><Pill>Phase 5</Pill></section><section className="surface feature-card"><div className="feature-icon"><ShieldCheck size={22}/></div><h2>Contact preferences</h2><p>Institution-specific announcement permissions and Reminder Service status.</p><Pill>Phase 5</Pill></section></div><div className="info-inline"><Info size={17}/> No WhatsApp messages can be sent from Sadhana at this stage. Existing Charu messaging is completely untouched.</div></>;
}
function SettingsPage({ workspace }: any) { const sections=[{title:'Practice reminders',text:'7:00 PM UK default; individual overrides preserved.'},{title:'Practice alerts',text:'Low practice below 50%; missing submissions 2 expected days.'},{title:'Attendance reminders',text:'Exactly 24 hours before each class starts.'},{title:'Reporting',text:'Sunday 10:00 AM UK institution summary; 30 minutes before class teacher report.'},{title:'Online classes',text:'Links managed externally and not stored in Sadhana.'},{title:'Audit history',text:'Important changes and report exports will be logged.'}]; return <><PageHeader kicker="INSTITUTION SETTINGS" title={`${institutions[workspace].name} settings`} description="Agreed defaults, for reference in this frontend preview."/><div className="settings-grid">{sections.map(s=><section className="surface setting-card" key={s.title}><div className="setting-icon"><Settings2 size={18}/></div><strong>{s.title}</strong><p>{s.text}</p></section>)}</div><div className="info-inline"><Info size={17}/> These are descriptive placeholders. Editing and saving settings will be added after a secure backend is connected.</div></>; }
function ProfileScreen({ student, classItem, activeTab, setTab, onBack, enrolments, members, onEnrolFromClass, onEditClass, onDeleteClass, isTeacher, cloud }: any) {
  const isStudent=!!student; const tabs=isStudent?['Overview','Classes','Practice','Attendance','Notes']:['Overview','Students','Schedule','Practice','RSVPs'];
  const item=student||classItem;
  /* v13.7.4 live calendar roster */
  const masterClassId=String(classItem?.classId||classItem?.original?.classId||(String(classItem?.id||'').startsWith('CLASS-')?classItem.id:'')||'');
  const [liveRoster,setLiveRoster]=useState<any[]>([]);
  /* v13.7.5 calendar session RSVP */
  const [sessionRsvps,setSessionRsvps]=useState<any[]>([]);
  const [sessionAttendance,setSessionAttendance]=useState<any[]>([]);
  const [sessionStatusBusy,setSessionStatusBusy]=useState(false);
  const [sessionStatusError,setSessionStatusError]=useState('');
  useEffect(()=>{
    if(!classItem||!cloud?.api)return;
    let active=true;
    setSessionRsvps([]);setSessionAttendance([]);setSessionStatusBusy(true);setSessionStatusError('');
    Promise.all([
      cloud.api.listOperations('rsvp',classItem.institution),
      cloud.api.listOperations('attendance',classItem.institution)
    ]).then(([rsvpResult,attendanceResult]:any[])=>{
      if(!active)return;
      setSessionRsvps(rsvpResult.records||[]);
      setSessionAttendance(attendanceResult.records||[]);
    }).catch((e:any)=>{if(active)setSessionStatusError(e instanceof Error?e.message:'Unable to load session responses')})
      .finally(()=>{if(active)setSessionStatusBusy(false)});
    return()=>{active=false};
  },[cloud?.api,classItem?.institution,classItem?.id]);

  const [rosterBusy,setRosterBusy]=useState(false);
  const [rosterError,setRosterError]=useState('');
  useEffect(()=>{
    if(!classItem||!cloud?.api)return;
    let active=true;setRosterBusy(true);setRosterError('');setLiveRoster([]);
    if(!masterClassId){setRosterError('Calendar event has no master class link.');setRosterBusy(false);return;}
    Promise.all([cloud.api.listOperations('enrolment',classItem.institution),cloud.api.listOperations('student',classItem.institution)])
      .then(([en,st]:any[])=>{
        if(!active)return;
        const students=new Map<string,any>((st.records||[]).filter((r:any)=>!r.archived).map((r:any)=>[r.id,r]));
        const rows=(en.records||[]).filter((e:any)=>e.classId===masterClassId&&!e.archived&&students.has(e.studentId)).map((e:any)=>{
          const student=students.get(e.studentId);return {id:e.studentId,name:student.name||'Student',rollNumber:student.rollNumber||'',status:getEnrolmentStatus(e)};
        });
        setLiveRoster(Array.from(new Map<string,any>(rows.map((r:any)=>[r.id,r])).values()).sort((a:any,b:any)=>String(a.rollNumber||a.name).localeCompare(String(b.rollNumber||b.name))));
      }).catch((e:any)=>{if(active)setRosterError(e instanceof Error?e.message:'Unable to load roster')})
      .finally(()=>{if(active)setRosterBusy(false)});
    return()=>{active=false};
  },[cloud?.api,classItem?.institution,masterClassId]);

  return <><button className="back-link" onClick={onBack}><ChevronLeft size={16}/> Back to {isStudent?'students':'classes'}</button><PageHeader kicker={isStudent? 'STUDENT PROFILE':'CLASS PROFILE'} title={item.name} description={isStudent?`${item.id} · ${institutions[item.institution].name} · Institution-specific profile`:`${item.id} · ${institutions[item.institution].name} · ${item.teacher}`} right={<div className="class-toolbar-actions"><Pill tone={isStudent&&item.status==='Upcoming'?'violet':'green'}>{isStudent?item.status:'Regular class'}</Pill>{!isStudent&&!isTeacher&&<><button className="reg-secondary" onClick={()=>onEditClass(item)}><CalendarDays size={15}/> Edit class</button><button className="reg-danger" onClick={()=>onDeleteClass(item)}><Trash2 size={15}/> Delete / archive</button></>}</div>}/><section className="surface profile-screen"><div className="tablist profile-tabs" role="tablist">{tabs.map(t=><button key={t} role="tab" aria-selected={t===activeTab} className={`tab ${t===activeTab?'active':''}`} onClick={()=>setTab(t)}>{t}</button>)}</div><div className="profile-body">{isStudent ? <StudentTab item={item} tab={activeTab}/> : <ClassTab item={item} tab={activeTab} enrolments={enrolments} members={members} onEnrolFromClass={onEnrolFromClass} isTeacher={isTeacher} liveRoster={liveRoster} rosterBusy={rosterBusy} rosterError={rosterError} useLiveRoster={!!cloud?.api} sessionRsvps={sessionRsvps} sessionAttendance={sessionAttendance} sessionStatusBusy={sessionStatusBusy} sessionStatusError={sessionStatusError}/>}</div></section></>;
}
function InfoRow({ name, children }: any) { return <div className="info-row"><span>{name}</span><strong>{children}</strong></div>; }
function StudentTab({ item, tab }: any) {
  const c: any=undefined; // Teacher student profiles await the live directory.
  if(tab==='Overview') return <div className="profile-two"><div><h2>Student details</h2><InfoRow name="Student ID">{item.id}</InfoRow><InfoRow name="Institution">{institutions[item.institution].name}</InfoRow><InfoRow name="Class">{c?.name}</InfoRow><InfoRow name="Status">{item.status}</InfoRow><InfoRow name="Parent contact">{item.contact} <span className="dim">(masked)</span></InfoRow></div><div className="profile-highlight"><h3>Practice snapshot</h3><div className="profile-metrics"><div><strong>{pct(item.practice)}</strong><span>Practice Rate</span></div><div><strong>{pct(item.submission)}</strong><span>Submission Rate</span></div></div><p>Practice records have not been connected.</p></div></div>;
  if(tab==='Classes') return <><h2>Class enrolments</h2><div className="detail-card"><GraduationCap size={18}/><div><strong>{c?.name}</strong><p>{dayLabel[c?.day]} · {displayTime(c?.time)} · {item.status}</p></div></div></>;
  if(tab==='Practice') return <><h2>Practice history</h2><div className="profile-metrics larger"><div><strong>{pct(item.practice)}</strong><span>Practice Rate</span></div><div><strong>{pct(item.submission)}</strong><span>Submission Rate</span></div><div><strong>{item.minutes} min</strong><span>Logged time</span></div></div><p className="muted">The detailed daily practice log will be connected after DynamoDB is ready.</p></>;
  if(tab==='Attendance') return <><h2>Attendance RSVPs</h2><div className="detail-card"><ClipboardCheck size={18}/><div><strong>Intended attendance</strong><p>Session-by-session RSVP history will appear here after integration.</p></div></div></>;
  return <><h2>Internal teacher notes</h2><p className="muted">Only authorised institution staff will be able to view these records.</p>{item.notes.length?item.notes.map((n,i)=><div className="note-card" key={i}><div className="note-head"><strong>{n.by}</strong><Pill>{n.status}</Pill></div><p>{n.text}</p><span>{n.date} · note</span></div>):<EmptyState title="No notes" detail="Teacher notes will be created in a later phase."/>}</>;
}
function ClassTab({item,tab,enrolments=[],members=[],onEnrolFromClass,isTeacher,liveRoster=[],rosterBusy=false,rosterError="",useLiveRoster=false,sessionRsvps=[],sessionAttendance=[],sessionStatusBusy=false,sessionStatusError=""}: any) {
  const enrolled=enrolments.filter(e=>e.institution===item.institution&&e.classId===item.id&&getEnrolmentStatus(e)!=='Archived').map(e=>({id:e.studentId, name:members.find(m=>m.id===e.studentId)?.name || e.studentId, status:getEnrolmentStatus(e), initials:(members.find(m=>m.id===e.studentId)?.name||'ST').split(' ').map(x=>x[0]).slice(0,2).join('')}));
  const currentRoster=useLiveRoster?liveRoster:enrolled;
  const rosterNotice=rosterBusy?'Loading current enrolments…':rosterError?'Unable to load roster: '+rosterError:'';
  if(tab==='Overview') return <div className="profile-two"><div><h2>Class details</h2><InfoRow name="Teacher">{item.teacher}</InfoRow><InfoRow name="Delivery">{item.mode}</InfoRow><InfoRow name="Venue">{item.venue}</InfoRow><InfoRow name="Schedule">{dayLabel[item.day]} · {displayTime(item.time)}</InfoRow><InfoRow name="Class dates">{item.startDate || "Original schedule"} — {item.endDate || "Ongoing"}</InfoRow><InfoRow name="Students">{rosterBusy?'Loading…':rosterError?'Unavailable':currentRoster.length+' enrolled'}</InfoRow></div><div className="profile-highlight"><h3>Class performance</h3><div className="profile-metrics"><div><strong>{item.rate==null?'—':`${item.rate}%`}</strong><span>Practice Rate</span></div><div><strong>{item.submission==null?'—':`${item.submission}%`}</strong><span>Submissions</span></div></div><p>Class performance will appear when practice data is connected.</p></div></div>;
  if(tab==='Students') return <><div className="reg-section-head"><h2>Enrolled students</h2>{!isTeacher && String(item.id).startsWith('CLASS-') && <button className="reg-primary" onClick={()=>onEnrolFromClass(item.id)}><Plus size={16}/> Enrol existing student</button>}</div>{rosterNotice&&<p role="status">{rosterNotice}</p>}<div className="profile-student-list">{currentRoster.map((s:any)=><div key={s.id}><span className="avatar avatar-small">{s.name.split(' ').map((x:string)=>x[0]).slice(0,2).join('')}</span><strong>{s.name}</strong><Pill tone={s.status==='Upcoming'?'violet':'green'}>{s.status}</Pill></div>)}</div><p className="muted">Future enrolments appear as Upcoming until their start date.</p></>;
  if(tab==='Schedule') return <><h2>Recurring timetable</h2><div className="detail-card"><CalendarDays size={20}/><div><strong>{dayLabel[item.day]} at {displayTime(item.time)} UK time</strong><p>{item.duration} minutes · {item.mode} · {item.venue}</p></div></div><p className="muted">Individual class exceptions, holidays and session history will be connected later.</p></>;
  if(tab==='Practice') return <><h2>Class practice</h2><div className="profile-metrics larger"><div><strong>{item.rate==null?'—':`${item.rate}%`}</strong><span>Practice Rate</span></div><div><strong>{item.submission==null?'—':`${item.submission}%`}</strong><span>Submission Rate</span></div></div><p className="muted">Student-level trends are planned for the live reports phase.</p></>;
  const sessionId=String(item.id||'');
  const rsvpByStudent=new Map<string,any>(sessionRsvps.filter((r:any)=>String(r.sessionId||'')===sessionId).map((r:any)=>[String(r.studentId),r]));
  const markByStudent=new Map<string,any>(sessionAttendance.filter((a:any)=>String(a.sessionId||'')===sessionId).map((a:any)=>[String(a.studentId),a]));
  const displayIntention=(raw:any)=>raw==='attending'?'Attending':raw==='not_attending'?'Not attending':raw==='unknown'?'Not sure':'No response';
  return <><h2>Session RSVPs & attendance</h2>
    <p className="muted">Responses and teacher-marked attendance for this dated session only. RSVP is not an attendance mark.</p>
    {sessionStatusBusy&&<p role="status">Loading session responses…</p>}
    {sessionStatusError&&<p role="alert" className="sadhana-sync-error">{sessionStatusError}</p>}
    {!sessionStatusBusy&&!sessionStatusError&&<div className="table-scroll"><table className="data-table"><thead><tr><th>Roll number</th><th>Student</th><th>RSVP</th><th>Attendance</th></tr></thead><tbody>
    {currentRoster.map((st:any)=>{const r=rsvpByStudent.get(String(st.id));const a=markByStudent.get(String(st.id));return <tr key={st.id}><td>{st.rollNumber||'—'}</td><td>{st.name}</td><td>{displayIntention(r?.intention)}</td><td>{a?.status?String(a.status):'Not marked'}</td></tr>})}
    {!currentRoster.length&&<tr><td colSpan={4}>{rosterBusy?'Loading enrolled students…':rosterError?'Roster unavailable':'No enrolled students found for this class.'}</td></tr>}
    </tbody></table></div>}
  </>;
}

// sadhana-ui-confirm-polish-20261019: consistent confirmation for session deletion.
function sadhanaConfirmDialog(message:string):Promise<boolean>{
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='sadhana-confirm-overlay';
  const panel=document.createElement('section');panel.className='sadhana-confirm-panel';
  panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Confirm permanent deletion');
  const header=document.createElement('div');header.className='sadhana-confirm-header';
  const heading=document.createElement('h2');heading.textContent='Delete selected session(s)?';
  const subtitle=document.createElement('p');subtitle.textContent='Administrator action · Permanent deletion';
  header.append(heading,subtitle);
  const detail=document.createElement('p');detail.className='sadhana-confirm-message';detail.textContent=message;
  const actions=document.createElement('div');actions.className='sadhana-confirm-actions';
  const keep=document.createElement('button');keep.type='button';keep.textContent='Keep sessions';keep.className='sadhana-confirm-keep';
  const remove=document.createElement('button');remove.type='button';remove.textContent='Delete sessions';remove.className='sadhana-confirm-delete';
  const finish=(value:boolean)=>{document.removeEventListener('keydown',esc);overlay.remove();resolve(value);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();finish(false);}};
  keep.onclick=()=>finish(false);remove.onclick=()=>finish(true);
  overlay.onclick=e=>{if(e.target===overlay)finish(false)};
  actions.append(keep,remove);panel.append(header,detail,actions);overlay.append(panel);
  document.body.append(overlay);document.addEventListener('keydown',esc);keep.focus();
 });
}

function SessionDrawer({ session, onClose, onClass, cloud, onSaved, canEdit, canDelete }: any) {
 const [editing,setEditing]=useState(false);
 const [scope,setScope]=useState<'one'|'following'>('one');
 const [futureSelection,setFutureSelection]=useState<'all'|'selected'>('all');
 const [effectiveFrom,setEffectiveFrom]=useState(session.dateISO||'');
 const [effectiveUntil,setEffectiveUntil]=useState(session.dateISO||'');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [pendingReview,setPendingReview]=useState<null|'historical'|'dated-link'>(null);
 const [impact,setImpact]=useState<any>(null);
 const [impactKey,setImpactKey]=useState('');
 const [teachers,setTeachers]=useState<Array<{id:string;displayName:string;active:boolean}>>([]);
 const [links,setLinks]=useState<import('./api/sadhanaClient').TeacherLinkRow[]>([]);
 const [pickedTeacherId,setPickedTeacherId]=useState<string|null>(null);
 const [form,setForm]=useState<any>({
   name:session.name,programme:session.original?.programme??session.programme??'',
   teacher:session.original?.teacher??session.teacher??'',
   mode:session.original?.mode??session.mode??'',location:session.original?.location??session.venue??'',
   date:session.original?.date??session.dateISO,endDate:session.original?.endDate??session.dateISO,
   startTime:session.original?.startTime??session.time??'',endTime:session.original?.endTime??session.endTime??'',
   status:session.original?.status??'confirmed',
 });
 useEffect(()=>{
   if(!editing||!cloud||!canEdit||!['sruti','raaga'].includes(session.institution))return;
   let active=true;
   Promise.all([cloud.api.listTeachers(session.institution),cloud.api.listTeacherLinks(session.institution)])
    .then(([directory,assignment])=>{
      if(active){setTeachers(directory.records.filter((t:any)=>t.active));setLinks(assignment.rows);}
    }).catch((e:Error)=>{if(active)setError(`Cannot load registered teachers: ${e.message}`);});
   return()=>{active=false;};
 },[editing,cloud?.api,canEdit,session.institution]);
 // Never silently pin a session to a teacher when only its time/location is edited.
 // Unlinked names stay unselected until the admin explicitly chooses a registry profile.
 const selectedTeacherId=pickedTeacherId??(session.original?.teacherId||'');
 const selectedTeacher=teachers.find(t=>t.id===selectedTeacherId);
 const original=session.original||{};
 const rule=links.filter(r=>r.scope==='series'&&r.classId===session.classId&&r.effectiveFrom<=session.dateISO&&teacherNameKey(r.teacher)===teacherNameKey(form.teacher))
  .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
 const resetImpact=()=>{setImpact(null);setImpactKey('');setBulkReview(null);};
 const update=(key:string,value:string)=>{resetImpact();setPendingReview(null);setForm((d:any)=>({...d,[key]:value,...(key==='date'&&!session.allDay?{endDate:value}:{})}));};
 const deleteOne=async()=>{
  if(!canDelete||!cloud||!session.sadhana)return;
  if(!await sadhanaConfirmDialog(`Permanently delete ${session.name} on ${session.dateISO}? This cannot be undone. Other sessions and the master class remain.`))return;
  setBusy(true);setError('');
  try{await cloud.api.deleteScheduleSession(session.institution,session.recordId,session.expectedVersion);onSaved();}
  catch(e){setError(e instanceof Error?e.message:'Unable to delete session.');}
  finally{setBusy(false);}
 };
 const [bulkReview,setBulkReview]=useState<any>(null);
 const deleteFuture=async()=>{
  if(!cloud||!canDelete||!session.classId)return;
  setBusy(true);setError('');
  try{
   const until=futureSelection==='selected'?effectiveUntil:'9999-12-31';
   if(until<effectiveFrom)throw new Error('End date must not precede start date.');
   if(!bulkReview||bulkReview.from!==effectiveFrom||bulkReview.until!==until){
    const review=await cloud.api.previewDeleteSeries(session.institution,session.classId,effectiveFrom,until,session.seriesMasterVersion);
    setBulkReview(review);return;
   }
   if(!await sadhanaConfirmDialog(`Permanently delete ${bulkReview.count} dated sessions from ${bulkReview.from} to ${bulkReview.until==='9999-12-31'?'the last stored session':bulkReview.until}? This cannot be undone.`))return;
   await cloud.api.deleteSeriesSessions(session.institution,session.classId,effectiveFrom,until,session.seriesMasterVersion,bulkReview.signature);
   setBulkReview(null);onSaved();
  }catch(e){setBulkReview(null);setError(e instanceof Error?e.message:'Unable to delete future sessions.');}
  finally{setBusy(false);}
 };
 const save=async()=>{
   if(!cloud||!session.sadhana||!canEdit)return;
   setBusy(true);setError('');
   try{
     if(scope==='following'&&futureSelection==='selected'&&(!effectiveUntil||effectiveUntil<effectiveFrom))throw new Error('Choose an end date on or after the start date.');
     const teacherChanged=form.teacher!==original.teacher;
     const newLink=session.recordType==='class-session'&&!!selectedTeacherId&&selectedTeacherId!==(original.teacherId||'');
     if(scope==='following'){
       if(!session.classId||!Number.isInteger(session.seriesMasterVersion))throw new Error('Master class version unavailable. Refresh the timetable.');
       const changes:Record<string,string>={};
       for(const key of ['name','programme','mode','location','status','startTime','endTime'])if(form[key]!==original[key])changes[key]=form[key];
       if(teacherChanged){
         if(!selectedTeacher||selectedTeacher.displayName!==form.teacher)throw new Error('Choose a registered teacher.');
         changes.teacher=selectedTeacher.displayName;
         changes.teacherId=selectedTeacher.id;
       }
       if(!Object.keys(changes).length&&newLink){
         if(!rule||rule.teacherId)throw new Error('No unlinked dated teacher rule found. Edit the master class to link its baseline.');
         if(!selectedTeacher||teacherNameKey(selectedTeacher.displayName)!==teacherNameKey(rule.teacher))throw new Error('Teacher does not match the existing dated rule.');
         if(pendingReview!=='dated-link'){setPendingReview('dated-link');return;}
         await cloud.api.linkTeacherIdentity(session.institution,session.classId,{teacherId:selectedTeacher.id,expectedVersion:rule.version,effectiveFrom:rule.effectiveFrom});
       }else{
         if(!Object.keys(changes).length)throw new Error('No changes. Choose a different teacher, adjust the time or link an existing assignment.');
         if(newLink&&!teacherChanged&&rule&&!rule.teacherId)throw new Error('First link the existing dated teacher assignment separately; then save time changes.');
         const until=futureSelection==='selected'?effectiveUntil:undefined;
        const key=JSON.stringify({changes,effectiveFrom,until,version:session.seriesMasterVersion});
        if(impactKey!==key){
          const result=await cloud.api.previewScheduleSeries(session.institution,session.classId,changes,effectiveFrom,session.seriesMasterVersion,until);
          setImpact(result);setImpactKey(key);return;
        }
        await cloud.api.updateScheduleSeries(session.institution,session.classId,changes,effectiveFrom,session.seriesMasterVersion,until);
        setImpact(null);setImpactKey('');
       }
     }else{
       const changes:Record<string,unknown>=Object.fromEntries(Object.entries(form).filter(([k,v])=>v!==original[k]));
       if((teacherChanged||newLink)&&session.recordType==='class-session'){
         if(!selectedTeacher||teacherNameKey(selectedTeacher.displayName)!==teacherNameKey(form.teacher))throw new Error('Choose a registered teacher.');
         changes.teacher=selectedTeacher.displayName;
         changes.teacherId=selectedTeacher.id;
       }
       if(!Object.keys(changes).length)throw new Error('No session changes to save.');
       if(session.dateISO<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
         if(pendingReview!=='historical'){setPendingReview('historical');return;}
       }
       await cloud.api.updateSchedule(session.institution,session.recordId,changes,session.expectedVersion);
     }
     onSaved();
   }catch(e){setError(e instanceof Error?e.message:'Could not save this event.');}
   finally{setBusy(false);}
 };
 return <div className="drawer-backdrop" onClick={onClose}><aside className="detail-drawer" onClick={e=>e.stopPropagation()} aria-label="Session quick details">
 <div className="drawer-head"><span>{editing?'EDIT TIMETABLE ENTRY':'SESSION DETAILS'}</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div>
 <div className={`drawer-cover ${session.institution}`}><CalendarDays size={25}/><h2>{session.name}</h2><Pill tone={session.status==='Cancelled'?'red':'green'}>{session.status}</Pill></div>
 {session.attentionItems?.length>0&&<div className="sadhana-record-issues sadhana-drawer-issues" role="note"><CircleAlert size={18}/><div><strong>Session needs attention</strong><ul>{session.attentionItems.map((issue:string)=><li key={issue}>{issue}</li>)}</ul><small>Based on the saved session. Refresh after fixing to clear this warning.</small></div></div>}
 {editing?<form className="reg-form sadhana-session-editor" onSubmit={e=>{e.preventDefault();void save();}}>
  {session.recordType==='class-session'&&<label className="sadhana-edit-field">
   <span>Which sessions should change?</span>
   <select aria-label="Which sessions should change?" value={scope} onChange={e=>{setScope(e.target.value as 'one'|'following');resetImpact();setError('');setPendingReview(null);}}>
     <option value="one">Just this session</option>
     <option value="following">Future sessions</option>
   </select>
  </label>}
  {session.recordType==='class-session'&&scope==='following'&&<fieldset className="sadhana-scope-picker">
    <legend>Apply changes to</legend>
    <div style={{display:'flex',flexWrap:'wrap',gap:'12px 20px',alignItems:'center'}}>
      <label style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="radio" name="sadhana-future-selection" checked={futureSelection==='all'} onChange={()=>{setFutureSelection('all');resetImpact();setError('');setPendingReview(null);}}/>
        <span>All future sessions</span>
      </label>
      <label style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="radio" name="sadhana-future-selection" checked={futureSelection==='selected'} onChange={()=>{setFutureSelection('selected');resetImpact();setError('');setPendingReview(null);}}/>
        <span>Selected dates</span>
      </label>
    </div>
  </fieldset>}
  {scope==='following'&&<label className="sadhana-edit-field"><span>Effective from (UK date)</span><input type="date" required value={effectiveFrom} onChange={e=>{setPendingReview(null);setEffectiveFrom(e.target.value);resetImpact();}}/></label>}
  {scope==='following'&&futureSelection==='selected'&&<label className="sadhana-edit-field">
    <span>Effective until (inclusive)</span>
    <input type="date" required min={effectiveFrom} value={effectiveUntil} onChange={e=>{setPendingReview(null);setEffectiveUntil(e.target.value);resetImpact();}}/>
  </label>}
 {(['name','programme','teacher','mode','location'] as const).map(k=><label key={k} className="sadhana-edit-field"><span>{k==='teacher'?'Registered teacher':k}</span>
 {k==='teacher'&&session.recordType==='class-session'?<select aria-label="Registered teacher for this assignment" value={selectedTeacherId} onChange={e=>{
    const t=teachers.find(t=>t.id===e.target.value);
    setPendingReview(null);setPickedTeacherId(t?.id||'');update('teacher',t?.displayName||'');
  }}><option value="">{form.teacher?`Unlinked: ${form.teacher}`:'Choose registered teacher'}</option>
  {teachers.map(t=><option key={t.id} value={t.id}>{t.displayName}</option>)}</select>
 :<input maxLength={k==='location'?300:180} value={form[k]||''} onChange={e=>update(k,e.target.value)} />}</label>)}
 {scope==='following'&&rule&&!rule.teacherId&&selectedTeacherId&&teacherNameKey(form.teacher)===teacherNameKey(rule.teacher)&&<p className="reg-footnote"><Link2 size={14}/> Existing teacher rule from {rule.effectiveFrom} is not linked. With no other changes, Save links its registered identity; it does not create a second rule.</p>}
 {scope==='one'&&<label className="sadhana-edit-field"><span>Date</span><input type="date" required value={form.date} onChange={e=>update('date',e.target.value)}/></label>}
 {session.allDay?<label className="sadhana-edit-field"><span>End date (exclusive)</span><input type="date" required value={form.endDate} onChange={e=>update('endDate',e.target.value)}/></label>:<div className="sadhana-edit-time-row"><label className="sadhana-edit-field"><span>Start time</span><input type="time" required value={form.startTime} onChange={e=>update('startTime',e.target.value)} /></label><label className="sadhana-edit-field"><span>End time</span><input type="time" required value={form.endTime} onChange={e=>update('endTime',e.target.value)} /></label></div>}
 <label className="sadhana-edit-field"><span>Status</span><select value={form.status} onChange={e=>update('status',e.target.value)}><option value="confirmed">Confirmed</option><option value="tentative">Tentative</option><option value="cancelled">Cancelled</option></select></label>
 {scope==='one'&&session.dateISO<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())&&<div className="sadhana-inline-note"><Info size={17}/><span>This is a past session. Edits here affect only this date.</span></div>}
 {scope==='following'&&<div className="sadhana-inline-note"><Info size={17}/><span>{futureSelection==='all'?`Changes will apply from ${effectiveFrom||'the selected date'} onwards. Earlier sessions are preserved.`:`Changes would apply from ${effectiveFrom||'the selected date'} through ${effectiveUntil||'the end date'}, inclusive. Earlier and later sessions retain their otherwise applicable assignments.`}</span></div>}
 {scope==='following'&&impact&&<div className="sadhana-inline-review" role="status"><Info size={18}/><div><strong>Review affected sessions</strong><p>{impact.changedCount} of {impact.totalSessions} stored sessions would change; {impact.protectedCount} protected by individual overrides. {impact.overlappingRules.length} overlapping later rules found.</p>{impact.protectedSessionIds.length>0&&<p>Protected session IDs: {impact.protectedSessionIds.join(', ')}</p>}{impact.overlappingRules.length>0&&<p>Other rules start: {impact.overlappingRules.map((r:any)=>r.effectiveFrom).join(', ')}. Later rules can supersede this change.</p>}<button type="button" className="sadhana-review-back" onClick={resetImpact}>Back to editing</button></div></div>}
 {pendingReview&&<div className="sadhana-inline-review" role="status" aria-live="polite"><CircleAlert size={19}/><div><strong>Review before saving</strong><p>{pendingReview==='historical'?`Correct only the session on ${session.dateISO}? Other dated sessions and rules will remain unchanged.`:`Link ${selectedTeacher?.displayName||'this teacher'} to the existing rule from ${rule?.effectiveFrom||effectiveFrom}? No sessions will be rewritten.`}</p><button className="sadhana-review-back" type="button" onClick={()=>setPendingReview(null)}>Back to editing</button></div></div>}
 {bulkReview&&scope==='following'&&<div className="sadhana-inline-review" role="status"><CircleAlert size={18}/><div><strong>Review {bulkReview.count} sessions for permanent deletion</strong><p>{bulkReview.dates.map((x:any)=>x.date).join(' · ')}</p><p>Only stored sessions for this master class are selected. The master class and rules remain.</p></div></div>}
 {error&&<p className="sadhana-sync-error" role="alert">{error}</p>}
 <div className="reg-modal-actions" style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'flex-end',gap:10}}>
 <button className="reg-secondary" style={{flex:'0 0 auto',width:'auto',margin:0}} type="button" onClick={()=>{setEditing(false);setPendingReview(null);}}>Cancel</button>
 {canDelete&&session.recordType==='class-session'&&<button style={{flex:'0 0 auto',width:'auto',margin:0}} type="button" className="reg-danger" disabled={busy} onClick={()=>void (scope==='following'?deleteFuture():deleteOne())}>{scope==='following'?(bulkReview?'Confirm delete future':'Delete future sessions'):'Delete session'}</button>}
 <button style={{flex:'0 0 auto',width:'auto',margin:0}} className="reg-primary" type="submit" disabled={busy||(scope==='following'&&futureSelection==='selected'&&(!effectiveUntil||effectiveUntil<effectiveFrom))}>{busy?'Saving…':pendingReview==='historical'?'Confirm correction':pendingReview==='dated-link'?'Confirm teacher link':scope==='following'&&impact?'Confirm recurring change':scope==='following'?'Preview future changes':'Save session'}</button></div>
 <p className="reg-footnote">{scope==='following'?(futureSelection==='all'?'Teacher and time changes apply from the chosen date until replaced by a later rule.':'Only sessions within the chosen inclusive date range are affected; outside it the applicable recurring schedule resumes.'):'Other sessions stay unchanged.'}</p>
 </form>:<><div className="drawer-info"><InfoRow name="Date">{ukDate(session.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</InfoRow><InfoRow name="Time">{session.allDay?'All day':`${displayTime(session.time)} – ${displayTime(session.endTime)} UK`}</InfoRow><InfoRow name="Programme">{session.programme||'—'}</InfoRow><InfoRow name="Teacher">{session.teacher}</InfoRow><InfoRow name="Delivery">{session.mode}</InfoRow><InfoRow name="Venue">{session.venue}</InfoRow>{session.venueId&&<InfoRow name="Address">{session.venueAddress}</InfoRow>}</div><div className="drawer-note"><Info size={17}/><span>{session.sadhana?'Stored in Sadhana DynamoDB. Individual sessions can be corrected without changing the rest of the timetable.':'Local-only record. Use the Sadhana-owned timetable for persistent edits.'}</span></div>{session.sadhana&&cloud&&canEdit?<button className="primary-button wide" onClick={()=>setEditing(true)}>Edit this session <ArrowRight size={16}/></button>:!session.source&&<button className="primary-button wide" onClick={()=>onClass(session)}>Open class profile <ArrowRight size={16}/></button>}</>}
 </aside></div>;
}
function NotificationDrawer({ notifications, setNotifications, allowed, filter, setFilter, onClose }: any) {
  const visible=notifications.filter(n=>allowed.includes(n.institution)).filter(n=>filter==='all'||n.institution===filter);
  const markRead = id => setNotifications(prev=>prev.map(n=>n.id===id?{...n,read:true}:n));
  const unread=visible.filter(n=>!n.read).length;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="detail-drawer notification-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><span>NOTIFICATION CENTRE</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="notification-heading"><h2>Notifications</h2><span>{unread} unread</span></div><div className="notification-filters"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All</button>{allowed.map(k=><button className={filter===k?'active':''} key={k} onClick={()=>setFilter(k)}>{institutions[k].name}</button>)}</div><div className="notification-list">{visible.map(n=><button key={n.id} className={`notification-item ${n.read?'':'unread'}`} onClick={()=>markRead(n.id)}><div className="notification-status">{!n.read&&<i/>}</div><div><div className="notification-title"><strong>{n.title}</strong><Pill tone={n.institution==='raaga'?'orange':'violet'}>{institutions[n.institution].name}</Pill></div><p>{n.detail}</p><span>{n.age} · {n.category}</span></div></button>)}{!visible.length&&<EmptyState title="No notifications" detail="There are no notices for this filter."/>}</div><div className="drawer-note"><Info size={17}/><span>Click a notification to mark it read. The notification service is not yet connected.</span></div></aside></div>;
}
/** Management records belong to one academy; the combined view never makes cross-academy writes. */
function AcademySelection({page,allowed,onSelect}: {
  page:string;allowed:InstitutionId[];onSelect:(institution:InstitutionId)=>void
}) {
  return <>
    <PageHeader kicker="ALL INSTITUTIONS" title={page} description="Choose an academy to manage its records. The combined workspace keeps the shared overview, timetable and venues available."/>
    <div className="institution-cards">{allowed.map(key=>{
      const inst=institutions[key];
      return <section className="surface institution-summary" key={key}>
        <div className="institution-label"><span className={`institution-symbol ${key}`}>{key==='raaga'?<Music2 size={19}/>:<BookOpen size={19}/>}</span><div><h2>{inst.name}</h2><p>{inst.descriptor}</p></div></div>
        <p>Open {page.toLowerCase()} for {inst.name}.</p>
        <div className="institution-actions"><button className="text-button" type="button" onClick={()=>onSelect(key)}>Continue to {inst.name} <ArrowRight size={14}/></button></div>
      </section>;
    })}</div>
  </>;
}

function StaffPortrait({name,initial,photoUrl=''}:{name:string;initial:string;photoUrl?:string}) {
  const local=name.toLowerCase().replace(/[^a-z]/g,'').replace(/^(mrs|miss|prof|mr|ms|dr)/,'')==='mohanakamanooru'
    ?`${import.meta.env.BASE_URL}teachers/mohana-kamanooru.png`:'';
  const [source,setSource]=useState(photoUrl||local);
  useEffect(()=>setSource(photoUrl||local),[photoUrl,local]);
  return source?<img src={source} alt="" onError={()=>setSource(source===photoUrl?local:'')}/>:<>{initial}</>;
}

export default function App({cloud}: {cloud?: CloudSession} = {}) {
  const [ownPhotoUrl,setOwnPhotoUrl]=useState(cloud?.staff.photoUrl||'');
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState('');
  const [syncError,setSyncError]=useState('');
  const [workspace,setWorkspace]=useState(()=>{try{return sessionStorage.getItem('sadhana:v095:workspace')||'combined';}catch{return 'combined';}});
  const [workspaceExpanded,setWorkspaceExpanded]=useState(false);
  const [role,setRole]=useState<'admin'|'teacher'|'student'>(()=>{try{const saved=sessionStorage.getItem('sadhana:view-as');return saved==='teacher'||saved==='student'?saved:'admin';}catch{return 'admin';}});
  const [learnerInstitutions,setLearnerInstitutions]=useState<InstitutionId[]>([]);
  const [familyChoices,setFamilyChoices]=useState<Array<{institution:InstitutionId;id:string;name:string;rollNumber:string}>>([]);
  const [chosenStudent,setChosenStudent]=useState('');
  const [familyAccessError,setFamilyAccessError]=useState('');
  const [familyAccessRetry,setFamilyAccessRetry]=useState(0);
  useEffect(()=>{if(!cloud)return;let active=true;
    // A failed guardian lookup is not proof that the family has no approved children.
    Promise.allSettled((['raaga','sruti'] as InstitutionId[]).map(async institution=>({institution,records:(await cloud.api.myLinkedStudents(institution)).records})))
      .then(results=>{if(!active)return;
        const institutions:InstitutionId[]=['raaga','sruti'];
        const success=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
        const failed=results.flatMap((result,index)=>result.status==='rejected'?[institutions[index]]:[]);
        setFamilyAccessError(failed.length?`Could not verify approved family access for ${failed.map(i=>i==='raaga'?'Raagasudha':'Śruti Vedam').join(' and ')}. Please retry; this does not mean your approvals were removed.`:'');
        setLearnerInstitutions(success.filter(r=>r.records.length).map(r=>r.institution));
        setFamilyChoices(success.flatMap(r=>r.records.map(s=>({institution:r.institution,id:s.id,name:s.name,rollNumber:s.rollNumber}))));
      });
    return()=>{active=false};
  },[cloud?.api,familyAccessRetry]);
  const [page,setPage]=useState(()=>{try{return sessionStorage.getItem('sadhana:v095:page')||'Dashboard';}catch{return 'Dashboard';}});
  const [mobileNav,setMobileNav]=useState(false);
  useEffect(()=>{try{sessionStorage.setItem('sadhana:v095:page',page);sessionStorage.setItem('sadhana:v095:workspace',workspace);}catch{/* private mode */}},[page,workspace]);
  const [student,setStudent]=useState(null);
  const [classProfile,setClassProfile]=useState(null);
  const [profileTab,setProfileTab]=useState('Overview');
  const [session,setSession]=useState(null);
  const [scheduleRevision,setScheduleRevision]=useState(0);
  const [studentFilter,setStudentFilter]=useState('All');
  const [studentQuery,setStudentQuery]=useState('');
  const [classView,setClassView]=useState('month');
  const [weekOffset,setWeekOffset]=useState(0);
  const [notifsOpen,setNotifsOpen]=useState(false);
  const [notifFilter,setNotifFilter]=useState('all');
  const [notifications,setNotifications]=useState<any[]>([]);
  const [families,setFamilies]=useState(initialFamilies);
  const [members,setMembers]=useState(initialMembers);
  const [enrolments,setEnrolments]=useState(initialEnrolments);
  const [classes,setClasses]=useState<any[]>([]);
  const [venues,setVenues]=useState<any[]>([]);
  const [venueLinks,setVenueLinks]=useState<Record<string,{masters:number;sessions:number}>>({});
  const [venueError,setVenueError]=useState('');
  const [venueSuccess,setVenueSuccess]=useState('');
  const refreshLiveData=async()=>{
    if(!cloud)return;
    const allowed=cloud.staff.institutions.filter((inst):inst is InstitutionId=>inst==='raaga'||inst==='sruti');
    if(!allowed.length)return;
    const [directory,schedules]=await Promise.all([
      cloud.api.list('venues',allowed[0]),
      Promise.all(allowed.map(institution=>cloud.api.listSchedule(institution))),
    ]);
    const links:Record<string,{masters:number;sessions:number}>={};
    for(const [i,schedule] of schedules.entries())for(const record of schedule.records||[]){
      // Count only records belonging to the requested institution.
      if(record.institution!==allowed[i]||!record.venueId)continue;
      if(!links[record.venueId])links[record.venueId]={masters:0,sessions:0};
      if(record.recordType==='class')links[record.venueId].masters++;
      else if(record.recordType==='class-session')links[record.venueId].sessions++;
    }
    setVenues(directory.records||[]);
    setVenueLinks(links);
    setVenueError('');
  };
  useEffect(()=>{
    if(!cloud){setVenues([]);setVenueLinks({});return;}
    let alive=true;
    // Only update state while mounted; future reloads are triggered by the Sync button.
    const allowed=cloud.staff.institutions.filter((inst):inst is InstitutionId=>inst==='raaga'||inst==='sruti');
    if(!allowed.length)return;
    Promise.all([cloud.api.list('venues',allowed[0]),Promise.all(allowed.map(inst=>cloud.api.listSchedule(inst)))])
      .then(([directory,schedules])=>{
        if(!alive)return;
        setVenues(directory.records||[]);
        const links:Record<string,{masters:number;sessions:number}>={};
        schedules.forEach((schedule,i)=>{for(const r of schedule.records||[]){
          if(r.institution!==allowed[i]||!r.venueId)continue;
          if(!links[r.venueId])links[r.venueId]={masters:0,sessions:0};
          if(r.recordType==='class')links[r.venueId].masters++;
          else if(r.recordType==='class-session')links[r.venueId].sessions++;
        }});
        setVenueLinks(links);
      }).catch((error:Error)=>{if(alive)setVenueError(error.message);});
    return()=>{alive=false;};
  },[cloud?.api]);
  const syncNow=async()=>{
    if(!cloud||syncing)return;
    setSyncing(true);setSyncError('');setSyncMessage('');
    try{
      await refreshLiveData();
      setScheduleRevision(n=>n+1); // Force timetable to re-read Sadhana records.
      setSyncMessage(`Live data updated at ${new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(new Date())}`);
    }catch(e){setSyncError(e instanceof Error?e.message:'Could not sync live data.');}
    finally{setSyncing(false);}
  };
  const [practiceLogs,setPracticeLogs]=useState<any[]>([]);
  const [deletePrompt,setDeletePrompt]=useState(null);
  const [classDialog,setClassDialog]=useState(null);
  const [venueDialog,setVenueDialog]=useState(null);
  const [changeNotice,setChangeNotice]=useState('');
  const [enrolClass,setEnrolClass]=useState('');
  const [registerOpenStudent,setRegisterOpenStudent]=useState('');
  const rawName=cloud?.staff.displayName?.trim() || 'Administrator';
  const displayName=rawName[0].toLocaleUpperCase('en-GB')+rawName.slice(1);
  const person={label:displayName,initial:(displayName[0]||'A').toLocaleUpperCase('en-GB'),
    institutions:cloud?.staff.institutions ?? [],admin:cloud?.staff.role==='admin',
    teacher:!!cloud?.staff.teacherInstitutions?.length || cloud?.staff.role==='viewer'};
  const availableInstitutions: InstitutionId[]=person.institutions;
  const verifiedTeachingInstitutions=(cloud?.staff.teacherInstitutions||[]).filter(i=>availableInstitutions.includes(i));
  // A selected view cannot create a permission; it only changes navigation.
  const currentRole=cloud?.staff.role==='learner'?'student':person.admin?(role==='student'&&learnerInstitutions.length?'student':role==='teacher'&&verifiedTeachingInstitutions.length?'teacher':'admin'):(verifiedTeachingInstitutions.length?'teacher':learnerInstitutions.length?'student':'teacher');
  const studentMode=currentRole==='student';
  const teacherMode=currentRole==='teacher';
  const allowedWorkspaces=studentMode?learnerInstitutions:teacherMode?(verifiedTeachingInstitutions.length?verifiedTeachingInstitutions:availableInstitutions):person.admin&&person.institutions.length>1?['combined',...person.institutions]:person.institutions;
  const currentWorkspace=allowedWorkspaces.includes(workspace)?workspace:(allowedWorkspaces[0] || 'sruti');
  const nav= (studentMode?['Dashboard','My classes','Timetable & calendar','Homework','Practice','Attendance','My teachers','My venues','My profile','Privacy & consents']:teacherMode?['Dashboard','My Classes','My Students','Teachers','Venues']:[...adminPages.slice(0,-1),'Account Access','Fees',...adminPages.slice(-1)]).filter(item=>item!=='Website Registrations'||(currentWorkspace==='raaga'&&person.admin&&!teacherMode));
  const activePage=page==='My Profile'?'My Profile':nav.some(item => item === page) ? page : 'Dashboard';
  const unread=notifications.filter(n=>!n.read&&availableInstitutions.includes(n.institution)).length;
  const switchWorkspace=(w)=>{setWorkspace(w);if(!studentMode)setPage('Dashboard');setStudent(null);setClassProfile(null);setMobileNav(false);};
  const switchRole=(r:'admin'|'teacher'|'student')=>{if(r==='student'&&!learnerInstitutions.length)return;if(r==='admin'&&!person.admin)return;if(r==='teacher'&&!verifiedTeachingInstitutions.length)return;setRole(r);try{sessionStorage.setItem('sadhana:view-as',r);}catch{/* private mode */}if(r==='teacher')setWorkspace(verifiedTeachingInstitutions[0]);if(r==='student')setWorkspace(learnerInstitutions[0]);setPage('Dashboard');setStudent(null);setClassProfile(null);setMobileNav(false);};
  const goPage=(p)=>{setEnrolClass('');setRegisterOpenStudent('');setPage(p);setStudent(null);setClassProfile(null);setMobileNav(false);if(p==='Families & Students'||p==='My Students'){setStudentFilter('All');setStudentQuery('');}};
  const openStudent=(s)=>{setWorkspace(s.institution);setStudent(teacherMode?s:null);setRegisterOpenStudent(teacherMode?'':s.id);setEnrolClass('');setClassProfile(null);setProfileTab('Overview');setPage(teacherMode?'My Students':'Families & Students');};
  const openClass=(c)=>{setClassProfile(c);setStudent(null);setSession(null);setProfileTab('Overview');setPage(teacherMode?'My Classes':'Classes & Timetable');};
  const enrolFromClass=(id)=>{setRegisterOpenStudent('');setEnrolClass(id);setClassProfile(null);setStudent(null);setPage('Families & Students');};
  const editClass=(c)=>setClassDialog({record:c});
  const saveClass=(draft, id)=>{
    if(id){setClasses(prev=>prev.map(c=>c.id===id?{...c,...draft}:c));setClassProfile(prev=>prev?.id===id?{...prev,...draft}:prev);}
    else setClasses(prev=>[...prev,{...draft,id: `${currentWorkspace==='raaga'?'R':'S'}-${String(Math.max(100,...prev.filter(c=>c.institution===currentWorkspace).map(c=>Number(c.id.match(/(\d+)$/)?.[1]||0)))+1)}`,institution:currentWorkspace,studentCount:0,status:'Scheduled'}]);
    setClassDialog(null);setChangeNotice(id?'Class updated locally.':'Class created locally.');
  };
  const saveVenue=async(draft:any,id?:string)=>{
    if(!cloud||cloud.staff.role!=='admin'||teacherMode)throw new Error('Administrator access is required to edit venues.');
    const institution: InstitutionId = (currentWorkspace==='raaga'||currentWorkspace==='sruti') && cloud.staff.institutions.includes(currentWorkspace)
      ? currentWorkspace : cloud.staff.institutions[0];
    if(!institution)throw new Error('An authorised academy administrator role is required to edit venues.');
    setVenueError('');setVenueSuccess('');
    try{
      if(id){
        const existing=venues.find(v=>v.id===id);
        if(!existing||!Number.isInteger(existing.version))throw new Error('Venue version missing. Refresh before editing.');
        const result=await cloud.api.update('venues',id,institution,draft,existing.version);
        setVenues(prev=>prev.map(v=>v.id===id?result.record:v));
      }else{
        const result=await cloud.api.create('venues',institution,draft);
        setVenues(prev=>[...prev,result.record].sort((a,b)=>String(a.name).localeCompare(String(b.name))));
      }
      setVenueDialog(null);
      setVenueSuccess(id?'Venue details saved to DynamoDB. Linked calendar sessions now show the updated details.':'New venue saved to DynamoDB.');
    }catch(error){
      if(error instanceof Error&&/changed|refresh/i.test(error.message))setVenueError('Conflict detected. Refresh the page before trying again.');
      throw error;
    }
  };
  const chooseAcademyForPage=(institution:InstitutionId)=>{
    if(!availableInstitutions.includes(institution))return;
    setWorkspace(institution);setStudent(null);setClassProfile(null);setMobileNav(false);
    // Keep the selected page: it becomes available in the chosen academy.
  };
  const requestDeleteClass=(record)=>setDeletePrompt({type:'class',record});
  const performDelete=()=>{
    const {record}=deletePrompt;
    {
      const linked=enrolments.some(e=>e.classId===record.id);
      if(linked){setClasses(prev=>prev.map(c=>c.id===record.id?{...c,archived:true}:c));setChangeNotice('Class archived because linked student enrolments exist. Historical records preserved.');}
      else{setClasses(prev=>prev.filter(c=>c.id!==record.id));setChangeNotice('Unlinked local class deleted.');}
      setClassProfile(null);setSession(null);
    }
    setDeletePrompt(null);
  };
  const workspaceName=currentWorkspace==='combined'?'All Institutions':institutions[currentWorkspace].name;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'sidebar-show':''}`}>
      <div className="brand"><div className="brand-symbol"><AcademyBrandIcon /></div><div><strong>Sadhana</strong><small>ACADEMY &amp; LEARNING PORTAL</small></div></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <div className="sidebar-workspace sadhana-workspace-dropdown">
  <button type="button"
    className="sadhana-workspace-button"
    aria-label="Choose workspace"
    aria-expanded={workspaceExpanded}
    onClick={()=>setWorkspaceExpanded(v=>!v)}>
    <span className="sidebar-work-icon">
      {currentWorkspace==='sruti' ? <AcademyBrandIcon academy="sruti" /> : currentWorkspace==='raaga' ? <AcademyBrandIcon academy="raaga" /> : <AcademyBrandIcon /> }
    </span>
    <span className="sadhana-workspace-text">
      <strong>{workspaceName}</strong>
      <small>{studentMode?'Learning portal':teacherMode?'My Teaching':'Administration'}</small>
    </span>
    <ChevronDown size={17}
      className={workspaceExpanded
        ? 'sadhana-workspace-chevron open'
        : 'sadhana-workspace-chevron'}/>
  </button>

  {workspaceExpanded &&
    <div className="sadhana-workspace-options"
      role="group" aria-label="Select an institution">
      {studentMode&&familyAccessError&&<div role="alert" style={{padding:10,fontSize:12}}>{familyAccessError}<button type="button" onClick={()=>setFamilyAccessRetry(n=>n+1)}>Retry verification</button></div>}
      {allowedWorkspaces.map(w =>
        <button type="button" key={w}
          className={w===currentWorkspace
            ? 'sadhana-workspace-option active'
            : 'sadhana-workspace-option'}
          onClick={()=>{
            switchWorkspace(w);
            setWorkspaceExpanded(false);
          }}>
          {w==='combined' ? <AcademyBrandIcon size={19} /> : w==='sruti' ? <AcademyBrandIcon academy="sruti" size={19} /> : <AcademyBrandIcon academy="raaga" size={19} />}
          <span>{w==='combined'
            ? 'All Institutions'
            : institutions[w].name}</span>
          {w===currentWorkspace && <Check size={15}/>}
        </button>
      )}
    </div>
  }
</div>
{(studentMode||person.admin&&(verifiedTeachingInstitutions.length>0||learnerInstitutions.length>0))&&<fieldset className="sadhana-view-as" aria-label="View as" style={{margin:'12px 16px 16px',padding:'11px 13px',border:'1px solid #536781',borderRadius:11,display:'grid',gap:9,color:'#eef3fb',fontSize:13}}>
 <legend style={{padding:'0 5px',fontSize:10,letterSpacing:'.13em',fontWeight:700,color:'#c5d1e2'}}>VIEW AS</legend>
 {person.admin&&<label style={{display:'flex',gap:9,alignItems:'center',cursor:'pointer'}}><input type="radio" name="sadhana-view-as" checked={currentRole==='admin'} onChange={()=>switchRole('admin')}/> Administrator</label>}
 {!studentMode&&verifiedTeachingInstitutions.length>0&&<label style={{display:'flex',gap:9,alignItems:'center',cursor:'pointer'}}><input type="radio" name="sadhana-view-as" checked={currentRole==='teacher'} onChange={()=>switchRole('teacher')}/> Teacher</label>}
 {studentMode? <>
  {familyChoices.filter(child=>child.institution===currentWorkspace).map(child=><label key={`${child.institution}:${child.id}`} style={{display:'flex',gap:9,alignItems:'center',cursor:'pointer'}}>
    <input type="radio" name="sadhana-learner-view-as" checked={child.id===(familyChoices.find(s=>s.institution===currentWorkspace&&s.id===chosenStudent)?.id||familyChoices.find(s=>s.institution===currentWorkspace)?.id)} onChange={()=>{setChosenStudent(child.id);setMobileNav(false)}}/>
    <span>{child.name}</span>
  </label>)}
  {!familyChoices.some(child=>child.institution===currentWorkspace)&&<span>{familyAccessError?'Family access could not be verified.':'No approved students in this institution.'}</span>}
 </>:learnerInstitutions.length>0&&<label style={{display:'flex',gap:9,alignItems:'center',cursor:'pointer'}}><input type="radio" name="sadhana-view-as" checked={false} onChange={()=>switchRole('student')}/> Student</label>}
</fieldset>}
<div className="sidebar-nav-scroll" tabIndex={0} aria-label="Sidebar menu, scroll for more options"><div className="sidebar-section-label">MENU</div>
      <nav aria-label="Primary navigation">{nav.map(p=>{const Icon=ICONS[p];return <button key={p} onClick={()=>goPage(p)} className={`nav-link ${activePage===p?'nav-active':''}`}><Icon size={18}/><span>{p}</span>{p==='Dashboard'&&<span className="nav-tiny-dot"/>}</button>;})}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><Sparkles size={20}/><strong>Thoughtfully built, step by step.</strong><span>Academy and Learning Portal</span></div><span className="sidebar-foot">Raagasudha × Śruti Vedam</span></div></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMobileNav(false)}/>}
    <div className="app-main"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setMobileNav(v=>!v)} aria-label="Toggle menu"><Menu size={21}/></button></div><div className="topbar-actions">

  <div className="topbar-account">

    <button
      type="button"
      className="user-avatar sadhana-profile-avatar"
      onClick={()=>goPage('My Profile')}
      title="My Profile"
      aria-label="Open My Profile">
      <StaffPortrait
        name={person.label}
        initial={person.initial}
        photoUrl={ownPhotoUrl}
      />
    </button>

    <div className="topbar-account-details">

      <button
        type="button"
        className="topbar-account-name"
        onClick={()=>goPage('My Profile')}
        title="Open My Profile">
        {person.label}
      </button>

      <div className="topbar-account-tools">

        {person.admin && (
          <button
            type="button"
            className="notification-trigger topbar-tool"
            title="Notifications"
            aria-label="Open notifications"
            onClick={()=>setNotifsOpen(true)}>
            <Bell size={17}/>
            {unread>0 && <span>{unread}</span>}
          </button>
        )}

        {cloud && (
          <button
            type="button"
            className="cloud-topbar-btn sync-button topbar-tool"
            onClick={()=>void syncNow()}
            disabled={syncing}
            title={syncing?'Syncing…':'Sync live data'}
            aria-label={syncing?'Syncing live data':'Sync live data'}>
            <RefreshCw
              size={17}
              className={syncing?'sync-spinning':''}
            />
          </button>
        )}

        {cloud && (
          <button
            type="button"
            className="cloud-logout topbar-tool"
            onClick={()=>void cloud.signOut()}
            title="Sign out of Sadhana"
            aria-label="Sign out of Sadhana">
            <LogOut size={17}/>
          </button>
        )}

      </div>
    </div>
  </div>
</div></header>
      {(syncMessage||syncError)&&<div className={`sync-notice ${syncError?'sync-notice-error':''}`} role="status">{syncError||syncMessage}<button type="button" onClick={()=>{setSyncMessage('');setSyncError('');}} aria-label="Dismiss sync message"><X size={14}/></button></div>}
      <main className="content">{studentMode&&cloud?<StudentHome cloud={cloud} initialInstitution={currentWorkspace as InstitutionId} embedded page={learnerPageMap[activePage]||'overview'} selectedStudentId={chosenStudent} onStudentChange={setChosenStudent}/>:<>{venueSuccess&&<div className="reg-success" role="status"><CheckCircle2 size={17}/><span>{venueSuccess}</span><button aria-label="Dismiss" onClick={()=>setVenueSuccess('')}><X size={15}/></button></div>}{changeNotice&&<div className="reg-success" role="status"><CheckCircle2 size={17}/><span>{changeNotice} These changes are local only and reset on refresh.</span><button aria-label="Dismiss" onClick={()=>setChangeNotice('')}><X size={15}/></button></div>}{student?<ProfileScreen student={student} activeTab={profileTab} setTab={setProfileTab} onBack={()=>setStudent(null)} enrolments={enrolments} members={members} isTeacher={teacherMode}/>:classProfile?<ProfileScreen classItem={classProfile} activeTab={profileTab} setTab={setProfileTab} onBack={()=>setClassProfile(null)} enrolments={enrolments} members={members} isTeacher={teacherMode} onEnrolFromClass={enrolFromClass} onEditClass={editClass} onDeleteClass={requestDeleteClass} cloud={cloud}/>:needsAcademySelection(currentWorkspace,activePage) ? <AcademySelection page={activePage} allowed={availableInstitutions} onSelect={chooseAcademyForPage}/> : activePage==='My Profile'?<>
      <PageHeader kicker="MY ACCOUNT"
        title="My Profile"
        description="Your Sadhana account and institution access."/>
      <section className="surface sadhana-account-card">
        <div className="sadhana-account-header">
          <div className="sadhana-account-photo">
            {cloud?<PhotoAvatarEditor api={cloud.api} onUploaded={setOwnPhotoUrl} label="your profile photo">
              <StaffPortrait name={person.label} initial={person.initial} photoUrl={ownPhotoUrl}/>
            </PhotoAvatarEditor>:<StaffPortrait name={person.label} initial={person.initial} photoUrl={ownPhotoUrl}/>}
          </div>
          <div>
            <h2>{person.label}</h2>
            <p>{cloud?.staff.role==='admin'
              ? 'Administrator' : 'Teacher access (assignment verification required)'}</p>
          </div>
        </div>
        <div className="sadhana-account-grid">
          <div>
            <small>Institution access</small>
            <strong>{person.institutions
              .map(i=>institutions[i].name)
              .join(' · ')||'—'}</strong>
          </div>
          <div>
            <small>Teacher profile</small>
            <strong>See Teachers directory</strong>
          </div>
        </div>
        {person.admin&&cloud?.staff.subject&&
          <details className="sadhana-account-details">
            <summary>Account reference (administrators)</summary>
            <label>Cognito subject
              <input readOnly value={cloud.staff.subject}/>
            </label>
          </details>}
      </section>
    </>:activePage==='Fees'&&person.admin&&!teacherMode?<FeesComingSoon/>:activePage==='Website Registrations'&&cloud&&currentWorkspace==='raaga'&&person.admin&&!teacherMode?<WebsiteRegistrations cloud={cloud}/>:activePage==='Dashboard'&&cloud?<LiveDashboard cloud={cloud} workspace={currentWorkspace} teacherMode={teacherMode} onChangePage={goPage}/>:activePage==='Dashboard'?<Dashboard workspace={currentWorkspace} isTeacher={teacherMode} onOpenStudent={openStudent} onChangePage={goPage} onSelectInstitution={switchWorkspace} allClasses={classes} members={members} enrolments={enrolments} practiceLogs={practiceLogs}/>:activePage==='Families & Students'||activePage==='My Students'?(teacherMode?<AcademyOperations cloud={cloud} workspace={currentWorkspace as InstitutionId} teacherMode={true} initialArea="enrolment"/>:<PersistentRegistration cloud={cloud!} workspace={currentWorkspace as InstitutionId} initialClass={enrolClass} initialStudent={registerOpenStudent}/>):activePage==='Classes & Timetable'||activePage==='My Classes'?<Timetable workspace={currentWorkspace} isTeacher={teacherMode} classView={classView} setClassView={setClassView} weekOffset={weekOffset} setWeekOffset={setWeekOffset} onSession={setSession} onClass={openClass} allClasses={classes} onCreateClass={()=>setClassDialog({record:null})} onEditClass={editClass} onDeleteClass={requestDeleteClass} cloud={cloud} revision={scheduleRevision} venues={venues}/>:activePage==='Practice & Reports'?<AcademyOperations cloud={cloud} workspace={currentWorkspace as InstitutionId} teacherMode={teacherMode} initialArea="practice"/>:activePage==='Communications'?<CommsPage workspace={currentWorkspace}/>:activePage==='Venues'?<VenueManager venues={venues} canEdit={!!cloud&&person.admin&&!teacherMode} linkedCounts={venueLinks} error={venueError} onAdd={()=>setVenueDialog({record:null})} onEdit={v=>setVenueDialog({record:v})}/>:activePage==='Teachers'?<TeacherManagement cloud={cloud} workspace={currentWorkspace}/>:activePage==='Administrators'?<AdminManagement cloud={cloud} workspace={currentWorkspace}/>:activePage==='Account Access'&&cloud?(currentWorkspace==='combined'?<AcademySelection page="Account Access" allowed={availableInstitutions} onSelect={switchWorkspace}/>:<AccountAccess cloud={cloud} institution={currentWorkspace as InstitutionId}/>):<SettingsPage workspace={currentWorkspace}/>}</>}
      </main>
      <footer className="main-footer"><span>Sadhana · Academy & Learning Portal</span><span>{cloud?"Live timetable and venues · other records awaiting import":"No backend session"}</span></footer>
    </div>
    {deletePrompt&&<div className="reg-shade" onMouseDown={e=>{if(e.target===e.currentTarget)setDeletePrompt(null);}}><section className="reg-modal" role="dialog" aria-modal="true" aria-label="Confirm delete or archive"><div className="reg-modal-head"><div><h2>Delete or archive class</h2><p>{deletePrompt.record.name}</p></div><button className="reg-icon-btn" onClick={()=>setDeletePrompt(null)}><X size={18}/></button></div><div className="reg-form"><div className="reg-warning"><CircleAlert size={17}/><span>{enrolments.some(e=>e.classId===deletePrompt.record.id)?'This class has student enrolments and will be archived to preserve history. It will no longer appear in active timetables.':'This locally created class has no enrolments and can be removed.'}</span></div><div className="reg-modal-actions"><button className="reg-secondary" onClick={()=>setDeletePrompt(null)}>Cancel</button><button className="reg-danger" onClick={performDelete}><Trash2 size={16}/>{enrolments.some(e=>e.classId===deletePrompt.record.id)?'Archive class':'Delete class'}</button></div></div></section></div>}
    {classDialog&&<ClassFormDialog workspace={currentWorkspace} record={classDialog.record} classes={classes} venues={venues} onSave={saveClass} onClose={()=>setClassDialog(null)}/>}
    {venueDialog&&<VenueFormDialog record={venueDialog.record} venues={venues} onSave={saveVenue} onClose={()=>setVenueDialog(null)}/>}
    {session&&<SessionDrawer session={session} canEdit={person.admin&&!teacherMode} canDelete={person.admin&&!teacherMode} cloud={cloud} onSaved={()=>{setSession(null);setScheduleRevision(n=>n+1);}} onClose={()=>setSession(null)} onClass={openClass}/>}
        {notifsOpen&&<NotificationDrawer notifications={notifications} setNotifications={setNotifications} allowed={availableInstitutions} filter={notifFilter} setFilter={setNotifFilter} onClose={()=>setNotifsOpen(false)}/>}
  </div>;
}
