import {test} from '@playwright/test';
import {assertRolePage} from '../../fixtures/rolePage';

test('admin can open Teachers',({page})=>assertRolePage(page,'admin','Teachers'));
test('teacher can open Teachers',({page})=>assertRolePage(page,'teacher','Teachers'));
