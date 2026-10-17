import { test, expect } from '@playwright/test';

test.beforeEach(async ({page})=>{
  // Allow only Vite's local dev-server connections. Never contact an actual API or external host.
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if ((u.hostname==='127.0.0.1'||u.hostname==='localhost') && u.port==='4179') return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('/tests/e2e/visual.html');
  await expect(page.getByRole('heading',{name:'Sadhana — Directory visual fixture'})).toBeVisible();
});

test('directory initial visual baseline and natural roll ordering',async({page})=>{
  await expect(page.locator('tbody tr').first()).toContainText('RS-1');
  await expect(page.locator('tbody tr').nth(1)).toContainText('RS-2');
  await expect(page.locator('tbody tr').nth(2)).toContainText('RS-10');
  await expect(page.locator('main')).toHaveScreenshot('students-initial.png',{animations:'disabled'});
});

test('archived filtering shows exactly one archived badge',async({page})=>{
  await page.getByLabel('Status').selectOption('Archived');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first().getByText('Archived',{exact:true})).toHaveCount(1);
  await expect(page.locator('main')).toHaveScreenshot('students-archived.png',{animations:'disabled'});
  await page.getByRole('button',{name:'Restore'}).click();
  await expect(page.getByTestId('count')).toHaveText('0 results');
  await page.getByLabel('Status').selectOption('All');
  await expect(page.getByText('RS-10')).toBeVisible();
});

test('family location filter visual baseline',async({page})=>{
  await page.getByLabel('Directory', { exact: true }).selectOption('families');
  await page.getByLabel('Location').selectOption('Carlisle');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('Rao Family');
  await expect(page.locator('main')).toHaveScreenshot('families-carlisle.png',{animations:'disabled'});
});

test('student location, sorting and CSV menu interactions',async({page})=>{
  await page.getByLabel('Location').selectOption('Carlisle');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button',{name:'Reverse sort'}).click();
  await expect(page.locator('tbody tr').first()).toContainText('RS-2');
  await page.getByLabel('Sort', { exact: true }).selectOption('name');
  await expect(page.locator('tbody tr').first()).toContainText('Meera Iyer');
  await page.locator('summary[aria-label="CSV data actions"]').click();
  await page.getByRole('button',{name:'Import CSV'}).click();
  await expect(page.getByLabel('Last CSV action')).toContainText('Import CSV');
  await page.locator('summary[aria-label="CSV data actions"]').click();
  await page.getByRole('button',{name:'Export filtered CSV'}).click();
  await expect(page.getByLabel('Last CSV action')).toContainText('Export CSV');
});
