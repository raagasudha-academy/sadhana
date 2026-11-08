/** Pure local-wall-clock -> UTC conversion for a READ-ONLY migration preview.
 * Throws on ambiguous/nonexistent times; never silently chooses a DST fold.
 */
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const formatters = new Map();
function formatter(timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit',hourCycle:'h23'
  }));
  return formatters.get(timeZone);
}
function components(ms, zone) {
  return Object.fromEntries(formatter(zone).formatToParts(new Date(ms))
    .filter(p => ['year','month','day','hour','minute','second'].includes(p.type))
    .map(p=>[p.type,Number(p.value)]));
}
export function wallClockToUtc(date,time,zone='Europe/London') {
  if (typeof date !== 'string' || typeof time !== 'string') return {status:'missing',instant:null};
  const d=datePattern.exec(date),t=timePattern.exec(time);
  if(!d || !t) return {status:'invalid',instant:null};
  const [,ys,ms,ds]=d; const [,hs,mins,secs='00']=t;
  const y=+ys,mo=+ms,day=+ds,h=+hs,m=+mins,s=+secs;
  const base=Date.UTC(y,mo-1,day,h,m,s);
  const chk=new Date(base);
  if(chk.getUTCFullYear()!==y||chk.getUTCMonth()!==mo-1||chk.getUTCDate()!==day||h>23||m>59||s>59)
    return {status:'invalid',instant:null};
  try { formatter(zone); } catch { return {status:'invalid-zone',instant:null}; }
  const expected={year:y,month:mo,day,hour:h,minute:m,second:s};
  // Sample offsets either side of date, capturing spring/autumn transitions.
  const offsets=new Set();
  for(const delta of [-36,-12,0,12,36]){
    const probe=base+delta*3600000,actual=components(probe,zone);
    const asUTC=Date.UTC(actual.year,actual.month-1,actual.day,actual.hour,actual.minute,actual.second);
    offsets.add(asUTC-probe);
  }
  const candidates=[];
  for(const offset of offsets){
    const instant=base-offset,got=components(instant,zone);
    if(Object.keys(expected).every(k=>got[k]===expected[k]))candidates.push(new Date(instant).toISOString());
  }
  const unique=[...new Set(candidates)].sort();
  if(unique.length===0)return {status:'nonexistent',instant:null};
  if(unique.length>1)return {status:'ambiguous',instant:null,candidates:unique};
  return {status:'converted',instant:unique[0]};
}
