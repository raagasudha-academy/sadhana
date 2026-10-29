import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {
  homeworkMediaAllowed,
  validateHomeworkMediaCounts
} from '../src/homeworkMediaPolicy.ts';

test('homework accepts up to three images',()=>{
  assert.equal(validateHomeworkMediaCounts([]),true);
  assert.equal(validateHomeworkMediaCounts(['image/jpeg']),true);
  assert.equal(validateHomeworkMediaCounts([
    'image/jpeg','image/png','image/webp'
  ]),true);
  assert.equal(validateHomeworkMediaCounts([
    'image/jpeg','image/png','image/webp','image/jpeg'
  ]),false);
});

test('homework rejects audio video and documents',()=>{
  for(const mime of [
    'audio/mpeg','audio/mp4','video/mp4',
    'application/pdf',
    'application/msword'
  ]){
    assert.equal(homeworkMediaAllowed(mime,1000),false);
    assert.equal(validateHomeworkMediaCounts([mime]),false);
  }
});

test('each image is limited to 5 MB',()=>{
  for(const mime of ['image/jpeg','image/png','image/webp']){
    assert.equal(homeworkMediaAllowed(mime,5_000_000),true);
    assert.equal(homeworkMediaAllowed(mime,5_000_001),false);
    assert.equal(homeworkMediaAllowed(mime,0),false);
  }
});
