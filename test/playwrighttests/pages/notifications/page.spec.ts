import {expect,test} from '@playwright/test';
import {openRoleSession} from '../../fixtures/rolePage';

for(const role of ['admin','teacher','student','guardian'] as const){
  test(`${role} can open their scoped notification centre`,async({page})=>{
    await openRoleSession(page,role);
    const bell=page.getByRole('button',{name:'Open notifications'});
    await expect(bell).toBeVisible();
    await bell.click();
    const drawer=page.locator('.notification-drawer');
    await expect(drawer.getByRole('heading',{name:'Notifications'})).toBeVisible();
    await expect(drawer.getByText('0 unread',{exact:true})).toBeVisible();
    await expect(drawer.getByRole('button',{name:'Śruti Vedam',exact:true})).toBeVisible();
    if(role==='admin')await expect(drawer.getByRole('button',{name:'Raagasudha',exact:true})).toBeVisible();
    else await expect(drawer.getByRole('button',{name:'Raagasudha',exact:true})).toHaveCount(0);
    await expect(drawer.getByText('There is no activity for this filter.')).toBeVisible();
    await expect(page).toHaveScreenshot(`${role}-notification-centre.png`,{animations:'disabled'});
  });
}
