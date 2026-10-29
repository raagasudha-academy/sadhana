import {test,expect} from '@playwright/test';

// Local synthetic fixture only: never contacts live Sadhana, Cognito or AWS.
const sizes=[{name:'phone-375',width:375,height:812},{name:'phone-390',width:390,height:844},{name:'tablet-768',width:768,height:1024},{name:'desktop-1280',width:1280,height:800}];
for(const size of sizes){
 test(`portal fixture loads and stays in viewport at ${size.name}`,async({page})=>{
  await page.setViewportSize({width:size.width,height:size.height});
  await page.route('**/*', route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='127.0.0.1'&&url.port==='4179'&&['http:','ws:'].includes(url.protocol))return route.continue();
   throw new Error(`Blocked network request to ${url.origin}`);
  });
  await page.goto('/tests/e2e/portal.html');
  await expect(page.getByText('Test Meera').first()).toBeVisible();
  const overflow=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth}));
  expect(overflow.document,`Horizontal overflow at ${size.name}: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewport+2);
  await page.screenshot({path:`test-results/viewport-${size.name}.png`,fullPage:true});
 });
}
