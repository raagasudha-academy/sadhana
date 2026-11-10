import {expect,test} from '@playwright/test';
import sharp from 'sharp';
import {openRoleSession} from '../../fixtures/rolePage';

async function openProfile(page:Parameters<typeof openRoleSession>[0],role:'student'|'guardian'){
  await openRoleSession(page,role);
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'My profile',exact:true}).click();
  await expect(page.getByRole('heading',{name:'My Profile',exact:true})).toBeVisible();
}

test('student account profile displays consistently and keeps login email read only',async({page})=>{
  await openProfile(page,'student');
  await expect(page.getByRole('heading',{name:'Fixture Student',exact:true})).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveAttribute('readonly','');
  await expect(page.getByLabel('Current phone number')).toHaveAttribute('readonly','');
  await expect(page.getByRole('heading',{name:'My children'})).toHaveCount(0);
  await expect(page).toHaveScreenshot('student-account-profile.png',{animations:'disabled'});
  await expect(page.locator('.sadhana-profile-wide')).toHaveScreenshot('student-contact-profile.png',{animations:'disabled'});
});

test('guardian profile shows each linked child with separate editable portal details',async({page})=>{
  await openProfile(page,'guardian');
  await expect(page.getByRole('heading',{name:'My children'})).toBeVisible();
  await expect(page.getByLabel('Fixture Child One profile')).toBeVisible();
  await expect(page.getByLabel('Fixture Child Two profile')).toBeVisible();
  await expect(page).toHaveScreenshot('guardian-family-profiles.png',{animations:'disabled'});
  await expect(page.getByLabel('My children profiles')).toHaveScreenshot('guardian-child-profiles.png',{animations:'disabled'});
});

test('student can update account name and verify a new phone number with a code',async({page})=>{
  await openProfile(page,'student');
  await page.getByLabel('Display / full name').fill('Fixture Student Updated');
  await page.getByRole('button',{name:'Save name changes'}).click();
  await expect(page.getByRole('status').filter({hasText:'Name updated successfully.'})).toBeVisible();
  let snapshot=await page.evaluate(()=>((window as any).__sadhanaProfileE2E.snapshot()));
  expect(snapshot.profile.name).toBe('Fixture Student Updated');

  await page.getByLabel('New phone number').fill('+447700900123');
  await page.getByRole('button',{name:'Send verification code'}).click();
  await expect(page.getByText('Verification code requested for the new number.')).toBeVisible();
  await page.getByLabel('SMS verification code').fill('000000');
  await page.getByRole('button',{name:'Verify number'}).click();
  await expect(page.getByRole('alert')).toHaveText('The verification code is incorrect.');
  await page.getByLabel('SMS verification code').fill('123456');
  await page.getByRole('button',{name:'Verify number'}).click();
  await expect(page.getByText('Phone number verified.')).toBeVisible();
  await expect(page.getByLabel('Current phone number')).toHaveValue('+447700900123');
  snapshot=await page.evaluate(()=>((window as any).__sadhanaProfileE2E.snapshot()));
  expect(snapshot.profile.phone).toBe('+447700900123');
  expect(snapshot.profile.phoneVerified).toBe(true);
});

test('guardian can change each child portal name and upload a private profile picture',async({page})=>{
  await openProfile(page,'guardian');
  const firstChild=page.getByLabel('Fixture Child One profile');
  await firstChild.getByLabel('Name shown in the portal').fill('Child One Preferred');
  await firstChild.getByRole('button',{name:'Save name'}).click();
  await expect(firstChild.getByRole('status')).toHaveText('Display name updated.');
  let snapshot=await page.evaluate(()=>((window as any).__sadhanaProfileE2E.snapshot()));
  expect(snapshot.learnerProfiles['E2E-CHILD-1'].preferredName).toBe('Child One Preferred');
  expect(snapshot.learnerProfiles['E2E-CHILD-2'].preferredName).toBe('');

  await page.route('**/__e2e_upload/**',route=>route.fulfill({status:200,body:'ok'}));
  const png=await sharp({create:{width:64,height:64,channels:4,background:'#c9a84c'}}).png().toBuffer();
  await firstChild.getByLabel('Profile picture').setInputFiles({name:'child.png',mimeType:'image/png',buffer:png});
  await expect(firstChild.getByRole('status')).toHaveText('Profile picture updated.');
  snapshot=await page.evaluate(()=>((window as any).__sadhanaProfileE2E.snapshot()));
  expect(snapshot.learnerMedia['E2E-CHILD-1']).toHaveLength(1);
  expect(snapshot.learnerMedia['E2E-CHILD-1'][0].purpose).toBe('profile');
});
