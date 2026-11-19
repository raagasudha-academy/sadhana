import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { homeworkMediaAllowed, validateHomeworkMediaCounts } from '../homeworkMediaPolicy.ts';

test('homework accepts up to four generic attachments', () => {
  assert.equal(validateHomeworkMediaCounts([]), true);
  assert.equal(validateHomeworkMediaCounts(['image/jpeg']), true);
  assert.equal(validateHomeworkMediaCounts(['image/jpeg', 'image/png']), true);
  assert.equal(
    validateHomeworkMediaCounts(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
    true,
  );
  assert.equal(
    validateHomeworkMediaCounts([
      'audio/mpeg',
      'audio/mp4',
      'audio/webm',
      'audio/aac',
      'audio/wav',
    ]),
    false,
  );
});

test('homework allows optional audio and video while rejecting documents', () => {
  for (const mime of ['audio/mpeg', 'audio/mp4', 'video/mp4']) {
    assert.equal(homeworkMediaAllowed(mime, 1000), true);
    assert.equal(validateHomeworkMediaCounts([mime]), true);
  }
  for (const mime of ['application/pdf', 'application/msword']) {
    assert.equal(homeworkMediaAllowed(mime, 1000), false);
    assert.equal(validateHomeworkMediaCounts([mime]), false);
  }
  assert.equal(
    validateHomeworkMediaCounts(['image/jpeg', 'image/png', 'audio/mpeg', 'video/mp4']),
    true,
  );
  assert.equal(validateHomeworkMediaCounts(['audio/mpeg', 'audio/mp4']), true);
});

test('each image is limited to 5 MB', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(homeworkMediaAllowed(mime, 5_000_000), true);
    assert.equal(homeworkMediaAllowed(mime, 5_000_001), false);
    assert.equal(homeworkMediaAllowed(mime, 0), false);
  }
  for (const mime of ['image/heic', 'image/heif']) {
    assert.equal(homeworkMediaAllowed(mime, 10_000_000), true);
    assert.equal(homeworkMediaAllowed(mime, 10_000_001), false);
  }
});
