import {test} from '@playwright/test';
import {assertRolePage} from '../../fixtures/rolePage';

test('admin can open Syllabus & Resources',({page})=>assertRolePage(page,'admin','Syllabus & Resources'));
