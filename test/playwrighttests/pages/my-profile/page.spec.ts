import {test} from '@playwright/test';
import {assertRolePage} from '../../fixtures/rolePage';

test('student can open My profile',({page})=>assertRolePage(page,'student','My profile'));
test('guardian can open My profile',({page})=>assertRolePage(page,'guardian','My profile'));
