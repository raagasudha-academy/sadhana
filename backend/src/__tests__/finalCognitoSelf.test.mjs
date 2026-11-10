import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finalCognitoSelfRoute} from '../finalCognitoSelf.mjs';
import {finalOnlyGate} from '../finalBoundary.mjs';

const calls=[];
const services={
 getProfile:async sub=>(calls.push(['get',sub]),{sub}),
 saveProfile:async(sub,body)=>(calls.push(['save',sub,body]),{updated:true}),
 uploadOwnPhoto:async(value,claims)=>(calls.push(['photo',value,claims.sub]),{photoUrl:'private-url'}),
};
const codecs={
 readJSON:raw=>JSON.parse(raw),
 readPhotoJSON:raw=>JSON.parse(raw),
};
const req=(parts,method,event={})=>({parts,method,event,claims:{sub:'verified-jwt-sub',role:'self'}});
const final={SADHANA_ENTITY_TABLE_SET:'final'};
const normal={SADHANA_ENTITY_TABLE_SET:'m9'};

test('M9/live mode unchanged; no self-service callbacks invoked', async()=>{
 calls.length=0;
 assert.equal(await finalCognitoSelfRoute(req(['me','profile'],'GET'),services,codecs,normal),undefined);
 assert.equal(calls.length,0);
});
test('final mode uses authenticated JWT subject for GET and PATCH of own profile',async()=>{
 calls.length=0;
 const get=await finalCognitoSelfRoute(req(['me','profile'],'GET'),services,codecs,final);
 assert.deepEqual(get,{status:200,body:{sub:'verified-jwt-sub'}});
 const patch=await finalCognitoSelfRoute(req(['me','profile'],'PATCH',{body:JSON.stringify({name:'A'})}),services,codecs,final);
 assert.equal(patch.status,200);
 assert.deepEqual(calls,[['get','verified-jwt-sub'],['save','verified-jwt-sub',{name:'A'}]]);
});
test('final mode own-photo POST uses JWT subject and no caller-provided target',async()=>{
 calls.length=0;
 const photo=await finalCognitoSelfRoute(req(['photos','me'],'POST',{body:JSON.stringify({base64:'x'})}),services,codecs,final);
 assert.equal(photo.status,200);
 assert.deepEqual(calls,[['photo',{base64:'x'},'verified-jwt-sub']]);
});
test('disallows changing someone else identity or admin/teacher photos',async()=>{
 calls.length=0;
 for(const path of [['me','other'],['photos','teacher'],['photos','administrator'],['identities','search'],['me']])
  assert.equal(await finalCognitoSelfRoute(req(path,'POST'),services,codecs,final),undefined);
 assert.equal(calls.length,0);
 assert.equal(finalOnlyGate(['photos','teacher'],'POST','early',final)?.status,503);
 assert.equal(finalOnlyGate(['me'],'GET','early',final)?.status,503);
});
test('unsupported methods fail with 405; base64 body decoding preserved',async()=>{
 calls.length=0;
 assert.equal((await finalCognitoSelfRoute(req(['me','profile'],'DELETE'),services,codecs,final)).status,405);
 assert.equal((await finalCognitoSelfRoute(req(['photos','me'],'GET'),services,codecs,final)).status,405);
 const data=Buffer.from(JSON.stringify({name:'Alice'})).toString('base64');
 await finalCognitoSelfRoute(req(['me','profile'],'PATCH',{isBase64Encoded:true,body:data}),services,codecs,final);
 assert.deepEqual(calls[0],['save','verified-jwt-sub',{name:'Alice'}]);
});
test('self-service route runs before the final-only legacy boundary',()=>{
 const code=readFileSync(new URL('../lambda.ts',import.meta.url),'utf8');
 const self=code.indexOf('finalCognitoSelfRoute(routeContext');
 const early=code.indexOf("finalOnlyGate(parts,method,'early')");
 assert.ok(self>0&&early>self);
 assert.ok(code.includes("uploadProfilePhoto(value,identity,'me')"));
 assert.ok(code.includes('!finalCognitoSelfWrite &&'));
 assert.ok(code.includes("process.env.SADHANA_ENTITY_TABLE_SET==='final' &&"));
});
