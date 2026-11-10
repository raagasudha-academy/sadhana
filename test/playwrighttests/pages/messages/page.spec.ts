import {expect,test} from '@playwright/test';
import {openRoleSession} from '../../fixtures/rolePage';

test('teacher opens Messages from My Students',async({page})=>{
 const runtimeErrors:string[]=[];
 page.on('pageerror',error=>runtimeErrors.push(error.message));
 await openRoleSession(page,'teacher');
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'My Students',exact:true}).click();
 const teaching=page.getByRole('navigation',{name:'My Teaching sections'});
 await expect(teaching.getByRole('button',{name:'Messages',exact:true})).toBeVisible();
 await teaching.getByRole('button',{name:'Messages',exact:true}).click();
 await expect(page.getByRole('region',{name:'Messages'})).toBeVisible();
 expect(runtimeErrors).toEqual([]);
 await expect(page).toHaveScreenshot('teacher-messages.png',{animations:'disabled'});
});

test('student opens Messages from the learner navigation',async({page})=>{
 const runtimeErrors:string[]=[];
 page.on('pageerror',error=>runtimeErrors.push(error.message));
 await openRoleSession(page,'student');
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Messages',exact:true}).click();
 await expect(page.getByRole('region',{name:'Messages'})).toBeVisible();
 expect(runtimeErrors).toEqual([]);
 await expect(page).toHaveScreenshot('student-messages.png',{animations:'disabled'});
});
