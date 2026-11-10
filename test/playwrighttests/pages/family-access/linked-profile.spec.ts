import {expect,test} from '@playwright/test';
import {openRoleSession} from '../../fixtures/rolePage';

test('student sees their own approved profile',async({page})=>{
  await openRoleSession(page,'student');
  await expect(page.getByText('Fixture Student').first()).toBeVisible();
});
