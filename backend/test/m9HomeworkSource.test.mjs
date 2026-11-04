import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/m9Homework.ts',import.meta.url),'utf8');
const route=readFileSync(new URL('../src/routes/m9HomeworkRoutes.ts',import.meta.url),'utf8');
const lambda=readFileSync(new URL('../src/lambda.ts',import.meta.url),'utf8');
test('M9 homework storage never uses legacy PK/SK addresses',()=>{
 assert.doesNotMatch(src,/SADHANA_TABLE_NAME|makeRoutedClient|OPS#|\bPK\s*:|\bSK\s*:/);
 assert.match(src,/sadhana-dev-m9-/);
 assert.match(src,/family-links/);assert.match(src,/enrolments/);
});
test('homework adapter runs before legacy learning routes',()=>{
 assert.ok(lambda.indexOf('m9HomeworkRoutes(routeContext)')>0);
 assert.ok(lambda.indexOf('m9HomeworkRoutes(routeContext)')<lambda.indexOf('learningRoutes(routeContext)'));
 assert.match(route,/Legacy storage is blocked/);
});
test('unmigrated evidence IDs cannot be saved to M9 submissions',()=>assert.match(src,/body\.attachmentIds\.length\)throw httpError\(503/));
