/** Pure, server-reusable Sadhana rules. Always revalidate authorization on backend. */
export type HomeworkState = 'draft'|'published'|'submitted'|'reviewed'|'revision_requested'|'closed';
export interface HomeworkRecord {state:HomeworkState; deadlineIso:string; releasedAtIso:string; revisionDeadlineIso?:string}
export function canSubmitHomework(item:HomeworkRecord, nowIso:string):boolean {
  const now=Date.parse(nowIso);
  const until=Date.parse(item.state==='revision_requested' && item.revisionDeadlineIso ? item.revisionDeadlineIso : item.deadlineIso);
  const released=Date.parse(item.releasedAtIso);
  if (![now,until,released].every(Number.isFinite)) return false;
  return ['published','submitted','revision_requested'].includes(item.state) && now>=released && now<=until;
}
export function canEditPractice(practicedOn:string, nowIso:string, reviewed:boolean):boolean {
  const now=new Date(nowIso);
  if (reviewed || !Number.isFinite(now.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(practicedOn)) return false;
  const day=Date.parse(`${practicedOn}T00:00:00Z`);
  const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  return Number.isFinite(day) && new Date(day).toISOString().slice(0,10)===practicedOn && today>=day && today-day<=7*86400000;
}
export type AbsenceNotice='on_time'|'late_emergency'|'invalid';
export function classifyAbsenceNotice(sessionStartsIso:string,submittedAtIso:string,isEmergency:boolean):AbsenceNotice {
  const session=Date.parse(sessionStartsIso),submitted=Date.parse(submittedAtIso);
  if (!Number.isFinite(session)||!Number.isFinite(submitted)||session<=submitted) return 'invalid';
  return session-submitted>=24*3600000?'on_time':isEmergency?'late_emergency':'invalid';
}
export function normalisePracticeTopics(topics:string[]):string[] {
  return [...new Set(topics.map(x=>x.trim()).filter(Boolean))].slice(0,12);
}
