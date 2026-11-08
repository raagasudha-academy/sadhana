import {test} from '@playwright/test';
import {assertRolePage} from '../../fixtures/rolePage';

test('admin can open Administrators',({page})=>assertRolePage(page,'admin','Administrators'));
