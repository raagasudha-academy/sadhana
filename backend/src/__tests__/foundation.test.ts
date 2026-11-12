import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';
import { fileURLToPath } from 'node:url';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const importer = readNormalizedSource(
  fileURLToPath(new URL('../websiteRegistrationImport.ts', import.meta.url)),
  'utf8',
);
const revoke = readNormalizedSource(
  fileURLToPath(new URL('../websiteRevocationPreflight.ts', import.meta.url)),
  'utf8',
);
test('importer preserves independently selected student postal address and guardian-inherited address', () => {
  assert.match(importer, /contactAddress:obj\(s\.contactPreferences\)\.addressSource==='guardian'/);
  assert.match(importer, /guardianSourcePersonId:/);
});
test('revocation preflight fails closed on website import mapping divergence', () => {
  assert.match(revoke, /Website import mapping does not match Sadhana/);
  assert.match(revoke, /Website registration could not be verified/);
});
