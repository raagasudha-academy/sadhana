import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInstitutionSender } from '../institutionEmailSenders.ts';

test('Raagasudha sender is correct', () => {
  const sender = resolveInstitutionSender('raaga');
  assert.equal(sender.email, 'noreply@raagasudhamusic.co.uk');
  assert.equal(sender.name, 'Sadhana – Raagasudha');
});

test('Sruti sender is correct', () => {
  const sender = resolveInstitutionSender('sruti');
  assert.equal(sender.email, 'noreply@sruti.co.uk');
  assert.equal(sender.name, 'Sruti Academy');
});

test('unknown institutions are rejected', () => {
  assert.throws(() => resolveInstitutionSender('unknown'));
  assert.throws(() => resolveInstitutionSender(undefined));
});
