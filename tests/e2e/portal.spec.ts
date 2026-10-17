import {expect,test} from '@playwright/test';

// Defense in depth: all requests must stay on the dedicated local Vite test server.
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.port==='4179'&&['http:','ws:'].includes(url.protocol))return route.continue();
    throw new Error(`E2E blocked unexpected network access: ${url.origin}`);
  });
  await page.goto('/tests/e2e/portal.html');
});

test('real portal renders synthetic students in registration directory',async({page})=>{
  await expect(page.getByText('Test Meera').first()).toBeVisible();
  await expect(page.getByText('Test Arjun').first()).toBeVisible();
});

test('real portal renders filter and directory navigation controls',async({page})=>{
  await expect(page.getByText('Test Meera').first()).toBeVisible();
  await expect(page.getByRole('button',{name:/families/i}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:/students/i}).first()).toBeVisible();
});
