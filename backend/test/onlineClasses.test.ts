import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ONLINE_CLASSES,makeOnlinePlan,markerDates,googleSnapshotHash} from '../src/onlineClasses.ts';

test('catalogue has 10 Raagasudha and 5 Sruti masters and no duplicate IDs',()=>{
 assert.equal(ONLINE_CLASSES.length,15);
 assert.equal(ONLINE_CLASSES.filter(x=>x.institution==='raaga').length,10);
 assert.equal(ONLINE_CLASSES.filter(x=>x.institution==='sruti').length,5);
 assert.equal(new Set(ONLINE_CLASSES.map(x=>x.id)).size,15);
});
test('weekday marker at any hour enables all that day’s individual class slots',()=>{
 const markers=markerDates([{id:'1',summary:'Online Session',status:'confirmed',start:{dateTime:'2026-10-21T10:00:00+01:00'}}],'2026-10-01','2026-11-01');
 assert.deepEqual(markers.dates,['2026-10-21']);
 const p=makeOnlinePlan(markers.dates);
 assert.equal(p.sessions.length,5); // Wednesday: three Raaga + two Sruti
 assert.equal(p.sessions.filter(s=>s.institution==='raaga').length,3);
 assert.equal(p.sessions.filter(s=>s.institution==='sruti').length,2);
 assert.ok(p.sessions.some(s=>s.startTime==='18:00'));
});
test('no weekend marker means no weekend sessions; weekend marker enables scheduled slots',()=>{
 const without=makeOnlinePlan(['2026-10-19','2026-10-21','2026-10-23']);
 assert.equal(without.sessions.filter(s=>s.date==='2026-10-24'||s.date==='2026-10-25').length,0);
 const withWeekend=makeOnlinePlan(['2026-10-24','2026-10-25']);
 assert.equal(withWeekend.sessions.length,4);
 assert.equal(withWeekend.sessions.filter(s=>s.date==='2026-10-24').length,3);
 assert.equal(withWeekend.sessions.filter(s=>s.date==='2026-10-25').length,1);
});
test('Tuesday marker creates no class; duplicates do not create duplicate sessions',()=>{
 const dates=markerDates([
  {id:'a',summary:'Online Session',status:'confirmed',start:{dateTime:'2026-10-20T10:00:00+01:00'}},
  {id:'b',summary:'Online Session',status:'confirmed',start:{dateTime:'2026-10-20T12:00:00+01:00'}},
  {id:'c',summary:'Online Session',status:'cancelled',start:{dateTime:'2026-10-21T10:00:00+01:00'}}
 ],'2026-10-01','2026-11-01');
 assert.deepEqual(dates.dates,['2026-10-20']);
 assert.equal(makeOnlinePlan(dates.dates).sessions.length,0);
});
test('two imports of same dates produce identical IDs and snapshot hashes',()=>{
 const p1=makeOnlinePlan(['2026-10-19','2026-10-21']);
 const p2=makeOnlinePlan(['2026-10-21','2026-10-19','2026-10-21']);
 assert.deepEqual(p1,p2);
 const markers=[{id:'a',summary:'Online Session',status:'confirmed',start:{dateTime:'2026-10-21T10:00:00+01:00'}}];
 assert.equal(googleSnapshotHash(markers,'2026-10-01','2026-11-01'),googleSnapshotHash([...markers],'2026-10-01','2026-11-01'));
});
test('UK local date is used near midnight and across BST winter change',()=>{
 const first=markerDates([{id:'a',summary:'Online Session',status:'confirmed',start:{dateTime:'2026-10-24T23:30:00Z'}}],'2026-10-01','2026-11-01');
 assert.deepEqual(first.dates,['2026-10-25']); // London still in BST
 const after=markerDates([{id:'b',summary:'Online Session',status:'confirmed',start:{dateTime:'2026-10-26T23:30:00Z'}}],'2026-10-01','2026-11-01');
 assert.deepEqual(after.dates,['2026-10-26']); // London now in GMT
});

test('explicit Sruti gap exception creates exactly 12 deduplicated weekday sessions without Google markers',async()=>{
 const {makeSrutiExceptionPlan,SRUTI_EXCEPTION_ID}=await import('../src/onlineClasses.ts');
 const {masters,sessions}=makeSrutiExceptionPlan();
 assert.equal(masters.length,5);
 assert.equal(sessions.length,12);
 assert.equal(new Set(sessions.map(x=>x.id)).size,12);
 assert.ok(sessions.every(x=>x.institution==='sruti'&&x.manualException===SRUTI_EXCEPTION_ID));
 assert.deepEqual(sessions.filter(x=>x.name.endsWith('Group 1')).map(x=>x.date),['2026-11-19','2026-11-26']);
 assert.deepEqual(sessions.filter(x=>x.name.endsWith('Group 2')).map(x=>x.date),['2026-11-20','2026-11-27']);
 assert.deepEqual(sessions.filter(x=>x.name.endsWith('Group 3')).map(x=>x.date),['2026-11-23','2026-11-30']);
 assert.deepEqual(sessions.filter(x=>x.name.endsWith('Group 4')).map(x=>x.date),['2026-11-18','2026-11-25','2026-12-02']);
 assert.deepEqual(sessions.filter(x=>x.name.endsWith('Group 5')).map(x=>x.date),['2026-11-18','2026-11-25','2026-12-02']);
 assert.equal(sessions.some(x=>['Saturday','Sunday'].includes(new Date(x.date!+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'}))),false);
});
