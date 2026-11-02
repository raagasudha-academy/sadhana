import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/StudentHome.tsx',import.meta.url),'utf8');
test('academy directory remains read-only and scoped',()=>{assert.ok(src.includes('ApprovedAcademiesStaffDirectory'));assert.ok(src.includes('myLinkedStudents(institution)'));assert.ok(src.includes('learnerAcademyDirectory(institution,approved.id)'));});
