import {expect,test, type Page} from '@playwright/test';

// Strict offline boundary: no DNS names, Cognito, backend, AWS, or production endpoints.
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.protocol==='http:' && url.hostname==='127.0.0.1' && url.port==='4179')return route.continue();
    throw new Error(`BLOCKED non-fixture request: ${url.origin}`);
  });
  await page.goto('/tests/e2e/portal.html');
  await expect(page.getByText('Test Meera').first()).toBeVisible();
});
async function chooseFilter(page:Page,name:string){
  const menu=page.locator('.reg-combined-filters');
  if(!(await menu.evaluate(el=>(el as HTMLDetailsElement).open))) await menu.locator('summary').click();
  await menu.getByRole('radio',{name,exact:true}).check();
}
const rows=(page:Page)=>page.locator('.reg-directory-table tbody tr');
async function table(page:Page){await page.getByRole('button',{name:'Table',exact:true}).click();await expect(page.locator('.reg-directory-table')).toBeVisible();}
async function families(page:Page){await page.locator('.reg-tabs').getByRole('button',{name:'Families'}).click();}
async function students(page:Page){await page.locator('.reg-tabs').getByRole('button',{name:'Students'}).click();}

test('real student table sorts roll numbers and names without changing identities',async({page})=>{
  await table(page);
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toContainText('RS-2');
  await page.getByRole('button',{name:/Sort by roll number/}).click();
  await expect(rows(page).first()).toContainText('RS-10');
  await page.getByRole('button',{name:/Sort by student name/}).click();
  await expect(rows(page).first()).toContainText('Test Arjun');
  const snapshot=await page.evaluate(()=>(window as any).__sadhanaE2E.snapshot());
  expect(snapshot.student.map((s:any)=>s.rollNumber).sort()).toEqual(['RS-10','RS-2','RS-3']);
});

test('real directory combines location and archived status filters',async({page})=>{
  await table(page);
  await chooseFilter(page,'Carlisle');
  await expect(rows(page)).toHaveCount(2);
  await chooseFilter(page,'Archived');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Test Arjun');
  await chooseFilter(page,'All statuses');
  await expect(rows(page)).toHaveCount(2);
});

test('real Families list and table filter by location',async({page})=>{
  await families(page);
  await expect(page.getByText('Test Guardian').first()).toBeVisible();
  await expect(page.getByText('Test Northern Guardian').first()).toBeVisible();
  await table(page);
  await expect(rows(page)).toHaveCount(2);
  await chooseFilter(page,'Newcastle');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Test Northern Guardian');
  await page.getByRole('button',{name:'List',exact:true}).click();
  await expect(page.getByText('Test Northern Guardian').first()).toBeVisible();
  await expect(page.getByText('Test Guardian',{exact:true})).toHaveCount(0);
});

test('real Family Details shows one Archived badge',async({page})=>{
  await families(page);
  await page.getByRole('button',{name:/Test Guardian/}).first().click();
  const card=page.locator('.reg-student-card').filter({hasText:'Test Arjun'});
  await expect(card).toBeVisible();
  await expect(card.getByText('Archived',{exact:true})).toHaveCount(1);
});

test('real Archive reload Restore preserves permanent identity and only updates archived',async({page})=>{
  await families(page);
  await page.getByRole('button',{name:/Test Guardian/}).first().click();
  const before=await page.evaluate(()=>(window as any).__sadhanaE2E.snapshot().student.find((s:any)=>s.id==='STUDENT-E2E-2'));
  await page.getByRole('button',{name:'Archive student Test Meera'}).click();
  await page.getByRole('button',{name:'Confirm archive'}).click();
  await expect(page.locator('.reg-student-card').filter({hasText:'Test Meera'}).getByText('Archived',{exact:true})).toHaveCount(1);
  await page.reload();
  // Reload defaults to Active students. Verify persistence in the isolated
  // fixture before selecting Archived to reveal the student in the UI.
  const persisted=await page.evaluate(()=>(window as any).__sadhanaE2E.snapshot().student.find((s:any)=>s.id==='STUDENT-E2E-2'));
  expect(persisted).toMatchObject({id:before.id,rollNumber:before.rollNumber,familyId:before.familyId,archived:true});
  await page.getByRole('button', {name:'Students', exact:true}).click();
  await chooseFilter(page,'Archived');
  await expect(page.getByText('Test Meera').first()).toBeVisible();
  await families(page);
  await page.getByRole('button',{name:/Test Guardian/}).first().click();
  await page.getByRole('button',{name:'Restore student Test Meera'}).click();
  await page.getByRole('button',{name:'Restore record'}).click();
  const after=await page.evaluate(()=>(window as any).__sadhanaE2E.snapshot().student.find((s:any)=>s.id==='STUDENT-E2E-2'));
  expect(after).toMatchObject({id:before.id,rollNumber:before.rollNumber,familyId:before.familyId,archived:false});
  const records=await page.evaluate(()=>(window as any).__sadhanaE2E.snapshot().student);
  expect(records.filter((s:any)=>s.id===before.id)).toHaveLength(1);
  const writes=await page.evaluate(()=>(window as any).__sadhanaE2E.writes());
  expect(writes).toEqual([{kind:'student',id:before.id,changes:{archived:false}}]);
});

test('real CSV data menu opens import workflow and exposes export action',async({page})=>{
  await page.locator('summary[aria-label="CSV data actions"]').click();
  await expect(page.getByRole('button',{name:'Export filtered CSV'})).toBeVisible();
  await page.getByRole('button',{name:'Import CSV'}).click();
  await expect(page.getByText('Import students from CSV')).toBeVisible();
  await expect(page.getByText('Download import template')).toBeVisible();
});
