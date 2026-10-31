import test from 'node:test';
import assert from 'node:assert/strict';
import {parentInvitationTemplate} from '../src/parentInvitationTemplate.ts';

test('invitation is HTML escaped and login is HTTPS only', () => {
  const value = parentInvitationTemplate(
    '<script>',
    'abc&def',
    'https://raagasudha-academy.github.io/sadhana/'
  );

  assert.doesNotMatch(value.html, /<script>/);
  assert.match(value.html, /&lt;script&gt;/);
  assert.match(value.text, /https:\/\//);

  assert.throws(() =>
    parentInvitationTemplate('A', 'pw', 'http://example.org')
  );
});
