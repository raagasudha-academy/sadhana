/** Nearest chronological session, one preceding it, and one following it. */
export function selectNearbySessions<T extends {id:string;date:string}>(sessions:readonly T[],today:string):Array<T & {windowPosition:'previous'|'current'|'following'}>{
 const ordered=[...sessions].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 if(!ordered.length)return [];
 // Current means today's session, otherwise the nearest upcoming session.
 // If all sessions are historical, use the most recent historical session.
 let current=ordered.findIndex(s=>s.date>=today);
 if(current<0)current=ordered.length-1;
 const selected:Array<T & {windowPosition:'previous'|'current'|'following'}>=[];
 for(const [idx,pos] of [[current-1,'previous'],[current,'current'],[current+1,'following']] as const){
  if(idx>=0&&idx<ordered.length)selected.push({...ordered[idx],windowPosition:pos});
 }
 return selected;
}
