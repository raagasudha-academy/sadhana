import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalAdministratorRoute} from '../finalAdministrator.mjs';

const final={
  SADHANA_ENTITY_TABLE_SET:'final',SADHANA_ENTITY_FINAL_ACK:'enabled',SADHANA_DATA_MODE:'off',
  SADHANA_FINAL_ADMIN_READS:'enabled',SADHANA_FINAL_ADMIN_INVITES:'enabled',
  SADHANA_FINAL_ADMIN_ACCESS_CHANGES:'enabled',SADHANA_FINAL_ADMIN_PROFILE_WRITES:'enabled'
};
const raaga={sub:'raaga-admin',admin:['raaga'],manager:false};
const manager={sub:'configured-manager',admin:['raaga','sruti'],manager:true};
const staff={sub:'staff',admin:[],manager:false};
let calls=[];
const services={
  list:async(institution,who)=>(calls.push(['list',institution,who.sub]),{records:[]}),
  invite:async(data,who)=>(calls.push(['invite',data,who.sub]),{invited:true}),
  changeAccess:async(data,who)=>(calls.push(['changeAccess',data,who.sub]),{granted:true}),
  updateProfile:async(data,who)=>(calls.push(['updateProfile',data,who.sub]),{updated:true}),
  parse:raw=>(calls.push(['parse']),JSON.parse(raw)),
};
const access={
  admin:(who,institution)=>{if(!who.admin?.includes(institution))throw Object.assign(new Error('Forbidden'),{status:403});},
  manager:who=>{if(!who.manager)throw Object.assign(new Error('Manager only'),{status:403});},
};
const req=(parts,method='GET',institution='raaga',claims=manager,body={})=>({
  parts:parts.split('/'),method,query:{institution},inst:institution,claims,
  event:{body:JSON.stringify(body)}
});
const route=(path,method='GET',institution='raaga',who=manager,body={},env=final)=>
  finalAdministratorRoute(req(path,method,institution,who,body),services,access,env);
const clear=()=>{calls=[];};

test('normal M9/split mode is unchanged',async()=>{
  clear();assert.equal(await route('administrators','GET','raaga',manager,{}, {...final,SADHANA_ENTITY_TABLE_SET:'m9',SADHANA_DATA_MODE:'split'}),undefined);
  assert.deepEqual(calls,[]);
});
test('final administrator GET is institution-scoped and uses existing Cognito reader',async()=>{
  clear();const result=await route('administrators','GET','sruti');
  assert.deepEqual(result,{status:200,body:{records:[]}});
  assert.deepEqual(calls,[['list','sruti','configured-manager']]);
  clear();await assert.rejects(()=>route('administrators','GET','sruti',raaga),{status:403});
  assert.deepEqual(calls,[]);
});
test('admin reads require dedicated flag, ACK, and non-split mode',async()=>{
  for(const env of [
    {...final,SADHANA_FINAL_ADMIN_READS:''},
    {...final,SADHANA_ENTITY_FINAL_ACK:''},
    {...final,SADHANA_DATA_MODE:'split'}
  ]){
    clear();assert.equal((await route('administrators','GET','raaga',manager,{},env)).status,503);
    assert.deepEqual(calls,[]);
  }
});
test('read denies unauthorised staff, missing JWT and invalid academy',async()=>{
  clear();await assert.rejects(()=>route('administrators','GET','raaga',staff),{status:403});
  assert.equal((await route('administrators','GET','shared')).status,400);
  assert.equal((await route('administrators','GET','raaga',{})).status,401);
  assert.deepEqual(calls,[]);
});
test('all 3 Cognito administrator actions reuse existing manager and payload policies',async()=>{
  clear();const invites=await route('administrators/invite','POST','raaga',manager,{email:'new@example.org',institution:'raaga',displayName:'New'});
  const accessUpdate=await route('administrators/access','POST','raaga',manager,{username:'existing',institution:'raaga',grant:false});
  const profile=await route('administrators/profile','PATCH','raaga',manager,{username:'existing',firstName:'New',lastName:'Name',title:'Dr'});
  assert.deepEqual([invites.status,accessUpdate.status,profile.status],[201,200,200]);
  assert.deepEqual(calls.filter(x=>x[0]!=='parse').map(x=>x[0]),['invite','changeAccess','updateProfile']);
});
test('non-manager is forbidden before processing any body',async()=>{
  clear();await assert.rejects(()=>route('administrators/invite','POST','raaga',raaga),{status:403});
  await assert.rejects(()=>route('administrators/access','POST','raaga',raaga),{status:403});
  assert.deepEqual(calls,[]);
});
test('each Cognito mutation can be independently disabled',async()=>{
  for(const [path,method,flag] of [
    ['administrators/invite','POST','SADHANA_FINAL_ADMIN_INVITES'],
    ['administrators/access','POST','SADHANA_FINAL_ADMIN_ACCESS_CHANGES'],
    ['administrators/profile','PATCH','SADHANA_FINAL_ADMIN_PROFILE_WRITES'],
  ]){
    clear();assert.equal((await route(path,method,'raaga',manager,{}, {...final,[flag]:''})).status,503);
    assert.deepEqual(calls,[]);
  }
});
test('unsupported, destructive, and nested routes fail closed',async()=>{
  for(const [path,method] of [
    ['administrators','DELETE'],['administrators/invite','GET'],
    ['administrators/extra/segment','POST'],['administrators/access','DELETE'],
    ['administrators/profile','POST'],['administrators/photos','POST']
  ]){
    clear();assert.equal((await route(path,method)).status,405);
    assert.deepEqual(calls,[]);
  }
});
test('base64 request body is decoded and passed to existing validation service',async()=>{
  clear();const context=req('administrators/invite','POST');
  const data={email:'test@example.org',displayName:'Test',institution:'raaga'};
  context.event={body:Buffer.from(JSON.stringify(data)).toString('base64'),isBase64Encoded:true};
  const out=await finalAdministratorRoute(context,services,access,final);
  assert.equal(out.status,201);assert.deepEqual(calls[1],['invite',data,'configured-manager']);
});
test('administrator facade is dispatched before final-only legacy boundary',()=>{
  const source=readFileSync(new URL('../lambda.ts',import.meta.url),'utf8');
  const bridge=source.indexOf('await finalAdministratorRoute(routeContext');
  const boundary=source.indexOf("finalOnlyGate(parts,method,'fallback')");
  const legacy=source.indexOf('await staffRoutes(routeContext)');
  assert.ok(bridge>0&&bridge<boundary&&boundary<legacy);
  assert.ok(source.includes('manager:identity=>requireAdminManager'));
});
