import {expect,test} from '@playwright/test';
import {assertRolePage,openRoleSession} from '../../fixtures/rolePage';

test('admin can open Website Registrations',({page})=>assertRolePage(page,'admin','Website Registrations'));

test('admin can activate a second academy family for a parent with an existing Sruti login',async({page})=>{
  await openRoleSession(page,'admin');
  await page.getByRole('button',{name:'Choose workspace'}).click();
  await page.getByRole('button',{name:'Raagasudha'}).click();
  await page.getByRole('button',{name:'People & Access',exact:true}).click();
  await page.getByRole('tab',{name:'Website Registrations'}).click();
  await expect(page.getByRole('heading',{name:'Website Registrations'})).toBeVisible();
  await page.getByLabel('Status').selectOption('approved');
  await page.getByRole('button',{name:/Fixture Parent/}).click();
  await expect(page.getByText('shared-parent@example.test')).toBeVisible();
  await expect(page.getByText('Fixture Child One').first()).toBeVisible();
  await expect(page.getByText('Fixture Child Two').first()).toBeVisible();
  await expect(page.getByText(/Address: Carlisle, United Kingdom/)).toBeVisible();
  await page.getByText('Registration actions').click();
  await page.getByRole('button',{name:'Activate in Sadhana'}).click();
  await page.getByRole('alertdialog',{name:'Activate approved application?'}).getByRole('button',{name:'Activate'}).click();
  await expect(page.getByText('Family: RAAGA-FAMILY-E2E')).toBeVisible();
  await expect(page.getByText(/RS-201, RS-202/)).toBeVisible();
  await expect(page.getByRole('region',{name:'Parent portal access'})).toContainText('Not invited');
  await page.getByText('Account actions').click();
  await page.getByRole('button',{name:'Link existing verified account'}).click();
  const linkDialog=page.getByRole('alertdialog',{name:'Link the existing parent login?'});
  await expect(linkDialog).toContainText('shared-parent@example.test');
  await linkDialog.getByRole('button',{name:'Confirm link'}).click();
  await expect(page.getByText('The existing parent login is linked to this Ragasudha family.')).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__sadhanaRegistrationE2E.calls());
  expect(calls).toEqual([
    {kind:'preview-import',value:{preview:true,identityCorrection:undefined}},
    {kind:'execute-import',value:{preview:false,confirmReference:'RS-2026-E2E-SHARED-EMAIL'}},
    {kind:'link-existing-parent',value:'RS-2026-E2E-SHARED-EMAIL'},
  ]);
});
