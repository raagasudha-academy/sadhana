import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCodeWhitespace } from '../../scripts/sourceText.mjs';

const readNormalizedSource = (...args) => normalizeCodeWhitespace(readFileSync(...args));
const src = readNormalizedSource(new URL('../legacyHomework.ts', import.meta.url), 'utf8');
const route = readNormalizedSource(new URL('../routes/homeworkRoutes.ts', import.meta.url), 'utf8');
const lambda = readNormalizedSource(new URL('../lambda.ts', import.meta.url), 'utf8');
test('M9 homework storage never uses legacy PK/SK addresses', () => {
  assert.doesNotMatch(src, /SADHANA_TABLE_NAME|makeRoutedClient|OPS#|\bPK\s*:|\bSK\s*:/);
  assert.match(src, /entityTable\(entity\)/);
  assert.match(src, /family-links/);
  assert.match(src, /enrolments/);
});
test('homework adapter runs before legacy learning routes', () => {
  assert.ok(lambda.indexOf('m9HomeworkRoutes(routeContext)') > 0);
  assert.ok(
    lambda.indexOf('m9HomeworkRoutes(routeContext)') <
      lambda.indexOf('learningRoutes(routeContext)'),
  );
  assert.match(route, /Legacy storage is blocked/);
});
test('M9 media receipts must be verified and media flag enabled before submission', () => {
  assert.match(src, /M9_HOMEWORK_MEDIA/);
  assert.match(src, /mediaStatus!=='ready'/);
  assert.match(src, /validateM9MediaSelection/);
});
