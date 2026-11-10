import type { ClassRecord, EnrolmentRecord, InstitutionId, PracticeRecord, PracticeReport } from './types';
import { ukISODate } from './registry';

// Calendar-only dates. Always use UTC arithmetic on YYYY-MM-DD; all dates are UK civil dates.
export const shiftDate=(iso: string,delta: number): string=>{const d=new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);};
export const weeksWindow=(weeks:4|8|12,today=ukISODate())=>({from:shiftDate(today,1-weeks*7),to:today});
export const lastFourWeeks=()=>weeksWindow(4);
export const between=(date: string,from: string,to: string)=>date>=from&&date<=to;
export const classOnDate=(c: ClassRecord, date: string)=>date>=(c.startDate||'0001-01-01')&&(!c.endDate||date<=c.endDate);
export const enrolOnDate=(e: EnrolmentRecord,date: string)=>date>=e.startDate&&(!e.endDate||date<=e.endDate);
export const studentClassIds=(id: string,inst: InstitutionId,enrolments: EnrolmentRecord[])=>new Set(enrolments.filter(e=>e.studentId===id&&e.institution===inst).map(e=>e.classId));
export function reportForStudent(studentId: string,institution: InstitutionId,from: string,to: string,enrolments: EnrolmentRecord[],classes: ClassRecord[],logs: PracticeRecord[],servicePeriods?: Record<string, {start: string;end?: string}[]>): PracticeReport {
  const enrolled=enrolments.filter(e=>e.studentId===studentId&&e.institution===institution);
  const periods=servicePeriods?.[`${institution}:${studentId}`];
  const valid=logs.filter(l=>l.studentId===studentId&&l.institution===institution&&l.status!=='Voided'&&between(l.date,from,to));
  let expected=0, submitted=0, practised=0, absent=0;
  for(let day=from;day<=to;day=shiftDate(day,1)) {
    const courses=enrolled.filter(e=>enrolOnDate(e,day)).map(e=>classes.find(c=>c.id===e.classId)).filter(c=>c&&classOnDate(c,day));
    const isSunday=new Date(`${day}T12:00:00Z`).getUTCDay()===0;
    const classDay=courses.some(c=>c.day===new Date(`${day}T12:00:00Z`).getUTCDay());
    // The reporting service eligibility model is provisional until persisted consent/service periods are wired.
    const serviceEligible=!periods||periods.some(p=>day>=p.start&&(!p.end||day<=p.end));
    if(!courses.length||isSunday||classDay||!serviceEligible)continue;
    expected++;
    const entry=valid.find(l=>l.date===day);
    if(entry){submitted++;if(entry.didPractice)practised++;else absent++;}
  }
  return {expected,submitted,practised,notPractised:absent,missing:expected-submitted,
    minutes:valid.reduce((a,l)=>a+(l.didPractice?Number(l.minutes||0):0),0),
    practiceRate:submitted?Math.round(practised/submitted*100):null,
    submissionRate:expected?Math.round(submitted/expected*100):null,
    entries:valid.length};
}
export function aggregate(rows: PracticeReport[]): PracticeReport {
  const expected=rows.reduce((n,r)=>n+r.expected,0), submitted=rows.reduce((n,r)=>n+r.submitted,0),practised=rows.reduce((n,r)=>n+r.practised,0);
  return {expected,submitted,practised,missing:expected-submitted,
    minutes:rows.reduce((n,r)=>n+r.minutes,0),
    practiceRate:submitted?Math.round(practised/submitted*100):null,
    submissionRate:expected?Math.round(submitted/expected*100):null};
}
