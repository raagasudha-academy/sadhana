import { BookOpen, CalendarDays, CheckCircle2, CircleAlert, FileBarChart2, FileText, LayoutDashboard, MapPin, MessageCircle, Search, Settings2, ShieldCheck, TrendingUp, UserRound, UsersRound } from "lucide-react";
import { Inbox } from "lucide-react";


export const ICONS = {
  Dashboard: LayoutDashboard,
  Students: UsersRound,
  'Families & Students': UsersRound,
  'People & Access': UsersRound,
  'Academy Workspace': LayoutDashboard,
  'Classes & Timetable': CalendarDays,
  'My Classes': CalendarDays,
  'My Students': UsersRound,
  'Practice & Reports': FileBarChart2,
  Communications: MessageCircle,
  Venues: MapPin,
  Settings: Settings2,
  'My learning': BookOpen,
  'My Syllabus': BookOpen,
  'Syllabus & Starter Pack': BookOpen,
  'Syllabus & Resources': BookOpen,
  Messages: MessageCircle,
  'My academy': UsersRound,
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
  'My Profile': UserRound,
  'Privacy & consents': ShieldCheck,
};
export const dayLabel = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ukToday = () => {
  const parts = Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(`${obj.year}-${obj.month}-${obj.day}T12:00:00Z`);
};
export const addDays = (date, days) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d; };
export const mondayOf = (date) => addDays(date, -(date.getUTCDay() + 6) % 7);
export const ukDate = (date: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(date);
export const displayTime = (s) => {
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const getSessions = (classes, start) => classes.map((c) => {
  const date = addDays(start, (c.day + 6) % 7);
  const status = 'Scheduled';
  return { ...c, date, dateISO:date.toISOString().slice(0,10), status };
}).filter(c=>!c.archived && (!c.startDate||c.dateISO>=c.startDate)&&(!c.endDate||c.dateISO<=c.endDate)).sort((a, b) => a.date.getTime() - b.date.getTime() || a.time.localeCompare(b.time));
export const pct = (n) => n == null ? '—' : `${n}%`;
export function Pill({ children, tone = 'neutral' }: any) { return <span className={`pill pill-${tone}`}>{children}</span>; }
export function MiniIcon({ type = 'neutral' }: any) { return <span className={`notice-icon notice-${type}`}>{type === 'warning' ? <CircleAlert size={17}/> : <CheckCircle2 size={17}/>}</span>; }
export function PageHeader({ kicker, title, description, right }: any) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{right && <div className="heading-actions">{right}</div>}</div>;
}
export function Metric({ icon: Icon, label, value, delta, tone, periodWeeks=4 }: any) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={19}/></span></div><div className="metric-value">{value}</div><div className="metric-foot">{delta ? <><TrendingUp size={13} /> {delta}</> : 'No records imported'} <span className="quiet">{tone || `· last ${periodWeeks} weeks`}</span></div></div>;
}
export function BarTrend({ data }: any) {
  return <div className="trend-chart"><div className="chart-guides"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="trend-weeks" style={{gridTemplateColumns:`repeat(${data.length},minmax(0,1fr))`}}>{data.map((d) => <div className="trend-week" key={d.w}><div className="bar-region"><div className="bar bar-practice" style={{ height: `${d.p}%` }} title={`Practice ${d.p}%`}/><div className="bar bar-submission" style={{ height: `${d.s}%` }} title={`Submission ${d.s}%`}/></div><span>{d.w}</span></div>)}</div></div>;
}
export function EmptyState({ title = 'Nothing to show here', detail = 'Try changing your filters.' }: any) { return <div className="empty-state"><Search size={25}/><strong>{title}</strong><span>{detail}</span></div>; }
export function Score({ value }: any) { return <span className={`score ${value !== null && value < 50 ? 'score-low' : ''}`}>{pct(value)}</span>; }

export function ClassCalendar({ classes, start, sessions, onSession }: any) {
  const days = Array.from({length:7}, (_,i) => addDays(start, i));
  return <div className="calendar-scroll"><div className="week-grid">{days.map((date, i) => <div className="week-col" key={i}><div className="week-head"><span>{ukDate(date, { weekday: 'short'})}</span><strong>{date.getUTCDate()}</strong></div><div className="week-slot">{sessions.filter(s => s.date.getTime() === date.getTime()).map(s => <button key={s.id} className={`calendar-event ${s.institution} ${s.status === 'Cancelled' ? 'event-cancelled' : ''}`} onClick={()=>onSession(s)}><strong>{s.allDay?'All day':displayTime(s.time)}</strong><span>{s.name}</span><small>{s.status === 'Cancelled' ? 'Cancelled' : s.mode}</small>{s.attentionItems?.length>0&&<span className="sadhana-record-alert sadhana-calendar-alert" role="img" aria-label={`Needs attention: ${s.attentionItems.join('; ')}`} title={s.attentionItems.join(' · ')}><CircleAlert size={16}/></span>}</button>)}{!sessions.some(s => s.date.getTime()===date.getTime()) && <span className="no-class">—</span>}</div></div>)}</div></div>;
}
export function teacherNameKey(name:string):string {
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .trim().replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i,'')
  .replace(/[^a-z0-9]/gi,'').toLowerCase();
}
export function matchingRegistryTeacher<T extends {id:string;displayName:string}>(name:string, teachers:T[]):T|undefined {
 const key=teacherNameKey(name);
 const matches=key?teachers.filter(t=>teacherNameKey(t.displayName)===key):[];
 return matches.length===1?matches[0]:undefined;
}
