import test from 'node:test';
import assert from 'node:assert/strict';
import { parentInvitationTemplate } from '../parentInvitationTemplate.ts';

test('invitation is HTML escaped and login is HTTPS only', () => {
  const value = parentInvitationTemplate(
    '<script>',
    'abc&def',
    'https://raagasudha-academy.github.io/sadhana/',
  );

  assert.doesNotMatch(value.html, /<script>/);
  assert.match(value.html, /&lt;script&gt;/);
  assert.match(value.text, /https:\/\//);

  for (const loginUrl of [
    'https://sadhana.sruti.co.uk/',
    'https://sadhana.raagasudhamusic.co.uk/',
    'https://sadhana-dev.sruti.co.uk/',
  ]) {
    assert.ok(parentInvitationTemplate('Parent', 'code', loginUrl).text.includes(loginUrl));
  }

  assert.throws(() => parentInvitationTemplate('A', 'pw', 'http://example.org'));
  assert.throws(() => parentInvitationTemplate('A', 'pw', 'https://sadhana.sruti.co.uk.evil/'));
  assert.throws(() =>
    parentInvitationTemplate('A', 'pw', 'https://sadhana.sruti.co.uk/?next=evil'),
  );
});
