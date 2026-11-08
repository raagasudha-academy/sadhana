import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./test/playwrighttests',
  fullyParallel:true,
  retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4179',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:800},locale:'en-GB',colorScheme:'light',deviceScaleFactor:1}}],
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',url:'http://127.0.0.1:4179/e2e-fixtures/visual.html',reuseExistingServer:false,timeout:30000},
});
