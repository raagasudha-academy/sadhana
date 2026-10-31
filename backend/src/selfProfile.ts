import {ownProfilePhoto} from './profilePhotos.ts';
import {CognitoIdentityProviderClient,ListUsersCommand,AdminUpdateUserAttributesCommand} from '@aws-sdk/client-cognito-identity-provider';
import {httpError} from './model.ts';
const client=new CognitoIdentityProviderClient({});
const pool=()=>{const id=process.env.SADHANA_COGNITO_USER_POOL_ID;if(!id)throw Error('Cognito pool is not configured');return id;};
async function ownUser(sub:string){
 if(!/^[0-9a-f-]{36}$/i.test(sub))throw httpError(403,'Invalid authenticated identity');
 const result=await client.send(new ListUsersCommand({UserPoolId:pool(),Filter:`sub = "${sub}"`,Limit:2}));
 const users=(result.Users||[]).filter(u=>u.Attributes?.some(a=>a.Name==='sub'&&a.Value===sub));
 if(users.length!==1||!users[0].Username)throw httpError(404,'Account not found');
 return users[0];
}
export async function getOwnProfile(sub:string){
 const u=await ownUser(sub);
 const a=(name:string)=>u.Attributes?.find(x=>x.Name===name)?.Value||'';
 return {name:a('name'),givenName:a('given_name'),familyName:a('family_name'),email:a('email'),emailVerified:a('email_verified')==='true',phone:a('phone_number'),phoneVerified:a('phone_number_verified')==='true',photoUrl:await ownProfilePhoto(sub)};
}
export function validateNameUpdate(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='familyName,givenName,name')throw httpError(400,'Only name, givenName and familyName may be changed.');
 const result:any={};
 for(const key of ['name','givenName','familyName'] as const){
  const v=value[key];
  if(typeof v!=='string'||!v.trim()||v.trim().length>90||/[\x00-\x1f\x7f<>]/.test(v))throw httpError(400,'Enter a valid name (maximum 90 characters).');
  result[key]=v.trim().replace(/\s+/g,' ');
 }
 return result as {name:string;givenName:string;familyName:string};
}
export async function saveOwnProfile(sub:string,value:any){
 const data=validateNameUpdate(value);
 const user=await ownUser(sub);
 await client.send(new AdminUpdateUserAttributesCommand({UserPoolId:pool(),Username:user.Username!,UserAttributes:[
  {Name:'name',Value:data.name},{Name:'given_name',Value:data.givenName},{Name:'family_name',Value:data.familyName}
 ]}));
 console.info('Sadhana own profile names updated',{subject:sub});
 return getOwnProfile(sub);
}
