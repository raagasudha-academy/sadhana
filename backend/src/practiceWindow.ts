/** Learner practice entry window: today and the preceding six UK calendar dates. */
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const isDate=(value:string)=>datePattern.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().startsWith(value);
export function ukPracticeToday(now:Date=new Date()):string{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const read=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 return `${read('year')}-${read('month')}-${read('day')}`;
}
export function isWithinPracticeWindow(date:string,today:string=ukPracticeToday()):boolean{
 if(!isDate(date)||!isDate(today))return false;
 const difference=(Date.parse(`${today}T12:00:00Z`)-Date.parse(`${date}T12:00:00Z`))/86400000;
 return Number.isInteger(difference)&&difference>=0&&difference<=6;
}
