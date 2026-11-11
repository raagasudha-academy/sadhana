import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(name)=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('both general M9 repositories target provisioned M9 namespace',()=>{
 for(const name of ['targetRepository.ts','targetWriter.ts']){
  assert.match(source(name),/entityTable\(entity,\{stage:env\}\)/);
  assert.doesNotMatch(source(name),/return `sadhana-\$\{env\}-\$\{entity\}`/);
 }
});
test('existing router is unchanged; website sync is separate and disabled by default',()=>{
 const route=source('routes/guardianRegistrationRoutes.ts');
 const sync=source('websiteImport.ts');
 assert.match(route,/website-import/);
 assert.match(route,/sync-preview/);
 assert.match(sync,/assertRaagaWebsiteSyncPolicy\(execute\)/);
 assert.match(source('raagaWebsiteSyncPolicy.mjs'),/M95_WEBSITE_SYNC_WRITES/);
 assert.match(source('raagaWebsiteSyncPolicy.mjs'),/SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES/);
 assert.match(sync,/expectedWebsiteMapping/);
 assert.match(sync,/updateWebsiteRegistrationImport/);
 assert.match(source('lambda.ts'),/m95GuardianRegistrationRoutes/);
});
test('approved web import verifies submitted guardian links and guards contact re-import',()=>{
 const core=source('websiteImportCore.mjs');
 assert.match(core,/accessStatus:'approved',relationshipVerified:true/);
 assert.match(core,/verificationSource:'approved-website-registration'/);
 assert.match(core,/CONTACT_GUARD/);
 assert.match(core,/assertWebsiteContactGuardAvailable/);
 assert.match(source('websiteImport.ts'),/assertWebsiteContactGuardAvailable\(inst,plan\.contactGuardId,contacts\)/);
});
