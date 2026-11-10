import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');
const entry=read('../lambda.ts');
test('Lambda authentication gates execute before domain route dispatch',()=>{
  const jwt=entry.indexOf('if(!claims?.sub)');
  const staff=entry.indexOf('if(!viewed.length&&!isAccessRoute)');
  const dispatch=entry.indexOf('await learningRoutes(routeContext)');
  assert.ok(jwt>0 && staff>jwt && dispatch>staff);
});
test('registration revocation routes retain administrator gate',()=>{
  const registration=read('../routes/registrationRoutes.ts');
  assert.match(registration,/Raagasudha administrator role required/);
  assert.match(registration,/revoke-cancel/);
  assert.match(registration,/cancelFencedWebsiteRevocation/);
});
test('learner academy directory checks verified identity and scopes results to the student',()=>{
  const learning=read('../routes/learningRoutes.ts');
  assert.match(learning,/await learnerIdentity\(inst,claims,studentId\);return json\(200,await academyDirectory\(inst,studentId\)\)/);
});
test('generic repository authorization and error redaction remain in Lambda',()=>{
  assert.match(entry,/repository\.list\(resource,inst,claims/);
  assert.match(entry,/status===500\?'Unable to complete the operation\.'/);
});
