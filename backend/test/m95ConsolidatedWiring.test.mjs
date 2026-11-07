import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=(name)=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
test('both general M9 repositories target provisioned M9 namespace',()=>{
 for(const name of ['m9TargetRepository.ts','m9TargetWriter.ts']){
  assert.match(source(name),/entityTable\(entity,\{stage:env\}\)/);
  assert.doesNotMatch(source(name),/return `sadhana-\$\{env\}-\$\{entity\}`/);
 }
});
test('existing router is unchanged; website sync is separate and disabled by default',()=>{
 const route=source('routes/m95GuardianRegistrationRoutes.ts');
 const sync=source('m95WebsiteImport.ts');
 assert.match(route,/website-import/);
 assert.match(route,/sync-preview/);
 assert.match(sync,/assertRaagaWebsiteSyncPolicy\(execute\)/);
 assert.match(source('m10RaagaWebsiteSyncPolicy.mjs'),/M95_WEBSITE_SYNC_WRITES/);
 assert.match(source('m10RaagaWebsiteSyncPolicy.mjs'),/SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES/);
 assert.match(sync,/expectedWebsiteMapping/);
 assert.match(sync,/updateWebsiteRegistrationImport/);
 assert.match(source('lambda.ts'),/m95GuardianRegistrationRoutes/);
});
test('web import keeps guardian links pending and guards contact re-import',()=>{
 const core=source('m95WebsiteImportCore.mjs');
 assert.match(core,/accessStatus:'pending'/);
 assert.match(core,/CONTACT_GUARD/);
 assert.match(source('m95WebsiteImport.ts'),/Primary contact belongs to an existing M9 family/);
});
