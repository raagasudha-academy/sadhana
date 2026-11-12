import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (path: string | URL, _encoding: 'utf8' = 'utf8') =>
  normalizeCodeWhitespace(readFileSync(path, 'utf8'));
const source = readNormalizedSource(
  new URL('../../scripts/dependencyPreview.mjs', import.meta.url),
  'utf8',
);
test('M8 preview uses only read-only DynamoDB commands', () => {
  assert.match(source, /ScanCommand/);
  assert.doesNotMatch(
    source,
    /\b(?:DeleteItemCommand|PutItemCommand|UpdateItemCommand|BatchWriteCommand|TransactWriteCommand)\b/,
  );
});
test('M8 preview redacts raw key and identity values', () => {
  assert.match(source, /createHmac/);
  assert.match(source, /containsRawIdentifiers:false/);
  assert.match(source, /No record is declared safe to delete/);
});
