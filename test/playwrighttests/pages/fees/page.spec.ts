import {test} from '@playwright/test';
import {assertRolePage} from '../../fixtures/rolePage';

test('admin can open Fees',({page})=>assertRolePage(page,'admin','Fees'));
