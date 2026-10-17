import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VENUES } from '../src/academyVenues.ts';
const manifest=JSON.parse(readFileSync(new URL('../import-data/academy-calendar-v0.7.json',import.meta.url),'utf8'));
const classes=manifest.classes as Array<{id:string;location:string}>;
const sessions=manifest.events.filter((e:{recordType:string})=>e.recordType==='class-session') as Array<{classId:string;location:string}>;
test('Three venues precisely cover seven master classes and 252 individual sessions',()=>{
 assert.equal(VENUES.length,3);
 assert.equal(classes.length,7);
 assert.equal(sessions.length,252);
 const classIds=VENUES.flatMap(v=>v.masterIds);
 assert.equal(new Set(classIds).size,7);
 for(const c of classes){const v=VENUES.find(v=>v.masterIds.includes(c.id as never));assert.ok(v,`No venue for ${c.id}`);assert.equal(c.location,v.address);}
 for(const s of sessions){const v=VENUES.find(v=>v.masterIds.includes(s.classId as never));assert.ok(v,`No venue for ${s.classId}`);assert.equal(s.location,v.address);}
 assert.deepEqual(VENUES.map(v=>sessions.filter(s=>v.masterIds.includes(s.classId as never)).length),[36,36,180]);
});
