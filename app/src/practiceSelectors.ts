export type PracticeEntry = {id:string;studentId:string;date:string;topic?:string;comments?:string;minutes?:number};
export function filterPracticeEntries<T extends PracticeEntry>(entries:readonly T[], studentId:string, search:string):T[]{
 const q=search.trim().toLocaleLowerCase();
 return entries.filter(p=>(!studentId||p.studentId===studentId)&&(!q||`${p.date} ${p.topic||''} ${p.comments||''}`.toLocaleLowerCase().includes(q)))
  .sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.id.localeCompare(b.id));
}
export function practiceTotals(entries:readonly PracticeEntry[]){
 return {entries:entries.length,minutes:entries.reduce((sum,p)=>sum+(Number.isFinite(Number(p.minutes))?Math.max(0,Number(p.minutes)):0),0),students:new Set(entries.map(p=>p.studentId)).size};
}
