import test from 'node:test';
import assert from 'node:assert/strict';
import { batchHash, diffCalendarSessions, projectGoogleEvents, sessionHash } from '../src/calendarModel.ts';
const make=(id:string,summary:string)=>({id,summary,start:{dateTime:'2026-10-18T17:00:00+01:00'},end:{dateTime:'2026-10-18T18:00:00+01:00'},status:'confirmed'});
test('projects UK event to absolute timestamps without attendees or descriptions',()=>{
 const projected=projectGoogleEvents([{...make('g1','Class 6'),description:'should not be stored',attendees:[{email:'example@example.com'}]} as any]);
 assert.equal(projected.sessions[0].start,'2026-10-18T16:00:00.000Z');
 assert.equal(projected.sessions[0].end,'2026-10-18T17:00:00.000Z');
 assert.equal('attendees' in projected.sessions[0],false);
 assert.equal('description' in projected.sessions[0],false);
});
test('skips all-day and malformed events',()=>{
 const x=projectGoogleEvents([{id:'a',start:{date:'2026-10-18'},end:{date:'2026-10-19'}},{...make('g1','Class 6'),end:{dateTime:'bad'}}]);
 assert.equal(x.sessions.length,0);assert.equal(x.skipped,2);
});
test('repeated sync is idempotent',()=>{
 const incoming=projectGoogleEvents([make('g1','Class 6')]).sessions;
 const old=[{...incoming[0],syncHash:sessionHash(incoming[0])}];
 assert.deepEqual(diffCalendarSessions(incoming,old,()=>true),{additions:[],changes:[],removed:[],unchanged:1});
});
test('changes and removed events are detected without hard deletes',()=>{
 const old=projectGoogleEvents([make('g1','Old name'),make('g2','Removed')]).sessions;
 const current=projectGoogleEvents([make('g1','New name')]).sessions;
 const diff=diffCalendarSessions(current,old,()=>true);
 assert.equal(diff.changes.length,1);assert.equal(diff.removed.length,1);assert.equal(diff.removed[0].status,'cancelled');
});
test('preview fingerprint is independent of event order',()=>{
 const items=projectGoogleEvents([make('g2','B'),make('g1','A')]).sessions;
 assert.equal(batchHash(items),batchHash([...items].reverse()));
});
