import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateM9MediaType,validateM9MediaSelection,m9MediaId} from '../src/mediaPolicy.mjs';
import {m9CutoverFence} from '../src/cutoverFence.mjs';
const read = path => readFileSync(new URL(path, import.meta.url),'utf8');
const access={strict:true,learnerReads:true,learnerWrites:true,homeworkWrites:true,media:true};
test('image, audio, video file ceilings',()=>{
 assert.equal(validateM9MediaType('image/jpeg',5_000_000)?.kind,'image');
 assert.equal(validateM9MediaType('image/jpeg',5_000_001),null);
 assert.equal(validateM9MediaType('audio/mp4',20_000_000)?.kind,'audio');
 assert.equal(validateM9MediaType('audio/mp4',20_000_001),null);
 assert.equal(validateM9MediaType('video/mp4',100_000_000)?.kind,'video');
 assert.equal(validateM9MediaType('video/mp4',100_000_001),null);
 assert.equal(validateM9MediaType('application/pdf',100),null);
 assert.equal(validateM9MediaType('video/quicktime',100),null);
});
test('image maximum 2 and at most one audio and video',()=>{
 assert.equal(validateM9MediaSelection(['image/jpeg','image/png','audio/mpeg','video/mp4']),true);
 assert.equal(validateM9MediaSelection(['image/jpeg','image/png','image/jpeg']),false);
 assert.equal(validateM9MediaSelection(['audio/mpeg','audio/mp4']),false);
 assert.equal(validateM9MediaSelection(['video/mp4','video/mp4']),false);
});
test('media receipts use unguessable ids not S3 keys',()=>{
 assert.equal(m9MediaId('MEDIA-12345678-1234-1234-1234-1234567890ab'),true);
 assert.equal(m9MediaId('MEDIA-../other'),false);
});
test('all existing M9 homework routes retain explicit fence',()=>{
 for(const [parts,method] of [
  [['learner','student','submission','homework','evidence','start'],'POST'],
  [['learner','student','submission','homework','evidence','finish'],'POST'],
  [['learner','student','submission','homework','evidence'],'GET'],
  [['homework','class','evidence','homework','student'],'GET']
 ]){
  assert.equal(m9CutoverFence(parts,method,access),null);
  assert.equal(m9CutoverFence(parts,method,{...access,media:false})?.status,503);
 }
});
test('unmigrated teacher materials stay fenced',()=>{
 assert.equal(m9CutoverFence(['homework','class','materials','hw','start'],'POST',access)?.status,503);
});
test('M9 media implementation uses existing submissions and private S3, no legacy',()=>{
 const s=read('../src/legacyHomework.ts');
 assert.match(s,/m9-homework-private/);
 assert.match(s,/table\('submissions'\)/);
 assert.match(s,/M9_HOMEWORK_MEDIA/);
 assert.match(s,/mediaStatus=:ready/);
 assert.match(s,/HeadObjectCommand/);
 assert.doesNotMatch(s,/OPS#GLOBAL|SADHANA_TABLE_NAME/);
});
