import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScheduleRecord, scheduleChanges, schedulePK, scheduleSK } from '../src/scheduleModel.ts';
import type { ScheduleRecord } from '../src/scheduleModel.ts';
const manifest = JSON.parse(readFileSync(new URL('../import-data/academy-calendar-v0.7.json',import.meta.url),'utf8')) as {classes:ScheduleRecord[],events:ScheduleRecord[]};
test('one-time manifest has correct groupings, no external Google ids, and unique Sadhana keys', () => {
 const all=[...manifest.classes,...manifest.events];
 assert.equal(manifest.classes.length,7); assert.equal(manifest.events.length,287);
 const keys=new Set<string>(); const masters=new Map(manifest.classes.map(x=>[x.id,x]));
 const counts:Record<string,number>={};
 for(const x of all){validateScheduleRecord(x);const key=`${schedulePK(x.institution)}|${scheduleSK(x.id)}`;assert.ok(!keys.has(key));keys.add(key);
  assert.equal('googleEventId' in x,false);assert.equal('googleCalendarId' in x,false);assert.equal('googleLink' in x,false);
  if(x.recordType==='class-session'){assert.equal(masters.get(x.classId||'')?.institution,x.institution);}
  counts[`${x.institution}:${x.recordType}`]=(counts[`${x.institution}:${x.recordType}`]||0)+1;
 }
 assert.equal(counts['raaga:class-session'],216);assert.equal(counts['sruti:class-session'],36);
 assert.equal(counts['shared:holiday'],32);assert.equal(counts['raaga:special-event'],3);
 assert.equal(counts['raaga:class'],6);assert.equal(counts['sruti:class'],1);
});
test('Durham stays continuous while Newcastle is split into four singing + Vedanta every date', () => {
 const durham=manifest.events.filter(x=>x.classId==='CLASS-RAAGA-DURHAM');
 assert.equal(durham.length,36);assert.ok(durham.every(x=>x.startTime==='08:30'&&x.endTime==='11:00'));
 const newcastle=manifest.events.filter(x=>x.location.includes('Newcastle upon Tyne')&&x.recordType==='class-session');
 assert.equal(newcastle.length,180);
 const byDay = new Map<string, ScheduleRecord[]>();
 for (const session of newcastle) {
  const date = session.date || '';
  const onDate = byDay.get(date) || [];
  onDate.push(session);
  byDay.set(date,onDate);
 }
 assert.equal(byDay.size,36);
 for(const records of byDay.values()){
  const slots=records.map(x=>[x.startTime,x.endTime,x.institution,x.programme].join(':')).sort();
  assert.deepEqual(slots,['13:00:13:30:raaga:Singing','13:30:14:00:raaga:Singing','14:00:14:30:raaga:Singing','14:30:15:00:raaga:Singing','15:00:15:30:sruti:Vedanta']);
 }
});
test('single dated session can change its time, while immutable import identity stays stable', () => {
 const current={...manifest.events.find(x=>x.classId==='CLASS-RAAGA-DURHAM')!,version:1};
 const changed=scheduleChanges(current,{date:current.date,startTime:'09:00',endTime:'10:30'});
 assert.equal(changed.startTime,'09:00');assert.equal(changed.endTime,'10:30');
 assert.equal(changed.id,current.id);assert.equal(changed.classId,current.classId);
 assert.throws(()=>scheduleChanges(current,{institution:'sruti'}),/Fields cannot be changed/);
});
