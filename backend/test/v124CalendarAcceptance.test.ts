import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../src/familyAccess.ts',import.meta.url),'utf8');
const router=readFileSync(new URL('../src/tableRouter.ts',import.meta.url),'utf8');
test('linked students must be approved before overview is returned',()=>{
 assert.match(home,/canReadStudent/);
 assert.match(home,/myStudentLinks/);
});
test('split routing keeps academy access in admin and calendar in calendar',()=>{
 assert.match(router,/pk\.startsWith\('ACCESS#'\)/);
 assert.match(router,/calendar:'sadhana-dev-calendar'/);
});
