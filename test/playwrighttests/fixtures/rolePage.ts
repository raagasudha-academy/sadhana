import {expect,type Page} from '@playwright/test';

export type PortalRole='admin'|'teacher'|'student'|'guardian';

export async function openRoleSession(page:Page,role:PortalRole){
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.port==='4179'&&['http:','ws:'].includes(url.protocol))return route.continue();
    throw new Error(`E2E blocked unexpected network access: ${url.origin}`);
  });
  await page.clock.install({time:new Date('2026-11-08T12:00:00Z')});
  await page.goto(`/e2e-fixtures/roles.html?role=${role}`);
}

export async function assertRolePage(page:Page,role:PortalRole,label:string){
  const runtimeErrors:string[]=[];
  page.on('pageerror',error=>runtimeErrors.push(error.message));
  await openRoleSession(page,role);
  const navigation=page.getByRole('navigation',{name:'Primary navigation'});
  const link=navigation.getByRole('button',{name:label,exact:true});
  await expect(link,`${role} navigation should include ${label}`).toBeVisible();
  await link.click();
  await expect(link).toHaveClass(/active|nav-active/);
  await expect(page.getByText('Loading section…')).toBeHidden();
  await expect(page.locator('main').last()).toBeVisible();
  const screenshotName=`${role}-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}.png`;
  await expect(page).toHaveScreenshot(screenshotName,{animations:'disabled'});
  expect(runtimeErrors,`${role} ${label} should not throw browser errors`).toEqual([]);
}
