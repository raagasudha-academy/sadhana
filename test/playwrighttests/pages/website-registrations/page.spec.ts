import {test} from '@playwright/test';
import {assertRolePage} from '../../fixtures/rolePage';

test('admin can open Website Registrations',({page})=>assertRolePage(page,'admin','Website Registrations'));
