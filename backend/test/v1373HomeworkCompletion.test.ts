import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/homework.ts','utf8');
test('reviewed submission is exposed and made read-only',()=>{
 assert.ok(source.includes('reviewedAt:r.reviewedAt||null'));
 assert.ok(source.includes('editable:isHomeworkReleased(h)&&isHomeworkOpenAt(h)&&!item?.reviewedAt'));
});
test('review and submission safety guards remain',()=>{
 assert.ok(source.includes("if(old?.reviewedAt)throw httpError(409"));
 assert.ok(source.includes("old.status!=='submitted'"));
 assert.ok(source.includes("body.attachmentIds.length>3"));
});
