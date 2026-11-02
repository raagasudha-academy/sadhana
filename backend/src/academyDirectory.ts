/** Read-only academy directory. Never return Cognito subjects, emails or account permissions. */
import {CognitoIdentityProviderClient,ListUsersInGroupCommand} from '@aws-sdk/client-cognito-identity-provider';
import {QueryCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {httpError} from './model.ts';
import {createHash} from 'node:crypto';
import {ownProfilePhoto,adminPhotoUrl} from './profilePhotos.ts';
import type {InstitutionId} from './model.ts';
import {parseAdminTitle} from './adminPolicy.ts';

const db=makeRoutedClient();
const cognito=new CognitoIdentityProviderClient({});
const table=()=>{if(!process.env.SADHANA_TABLE_NAME)throw Error('SADHANA_TABLE_NAME missing');return process.env.SADHANA_TABLE_NAME};
const pool=()=>{if(!process.env.SADHANA_COGNITO_USER_POOL_ID)throw Error('SADHANA_COGNITO_USER_POOL_ID missing');return process.env.SADHANA_COGNITO_USER_POOL_ID};
const groups:Record<InstitutionId,string>={raaga:'raagasudha-admin',sruti:'sruti-admin'};
/** Explicitly allowlist all fields. No registry record may be forwarded wholesale. */
export const publicTeacher=(x:any)=>({name:String(x.displayName||'').trim(),subjects:Array.isArray(x.subjects)?x.subjects.filter((s:unknown)=>typeof s==='string').slice(0,20):[]});
export const publicVenue=(x:any)=>({name:String(x.name||'').trim(),address:String(x.address||'').trim(),location:String(x.location||'').trim()});
export const publicAdmin = (
  x: {
   Attributes?: { Name?: string; Value?: string }[];
   Enabled?: boolean;
  }
) => {
 const get = (key: string) =>
   x.Attributes?.find(a => a.Name === key)?.Value?.trim() || '';

 const fullName = get('name');
 const fallback = [get('given_name'), get('family_name')]
   .filter(Boolean)
   .join(' ');

 return {
  name: fullName || fallback
 };
};
async function allByPartition(pk:string,prefix:string){
 let next:Record<string,unknown>|undefined;const rows:any[]=[];
 do{const r=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:prefix?'PK=:pk AND begins_with(SK,:sk)':'PK=:pk',ExpressionAttributeValues:prefix?{':pk':pk,':sk':prefix}:{':pk':pk},ExclusiveStartKey:next,Limit:100}));rows.push(...r.Items||[]);next=r.LastEvaluatedKey;if(rows.length>1500)throw httpError(413,'Directory size limit exceeded')}while(next);
 return rows;
}
export async function academyDirectory(inst:InstitutionId){
 if(inst!=='raaga'&&inst!=='sruti')throw httpError(400,'Select an academy');
 const [teachers,venues]=await Promise.all([allByPartition('TEACHER_REGISTRY','TEACHER#'),allByPartition('DIRECTORY#VENUE','')]);
 const administrators:Array<{name:string;publicId?:string;photoUrl?:string}>=[];let token:string|undefined;
 do{const r=await cognito.send(new ListUsersInGroupCommand({UserPoolId:pool(),GroupName:groups[inst],Limit:60,...(token?{NextToken:token}:{})}));const published=await Promise.all((r.Users||[]).filter(u=>u.Enabled!==false).map(async u=>{
  const info=publicAdmin(u);if(!info.name)return null;
  const sub=u.Attributes?.find(a=>a.Name==='sub')?.Value||'';
  const picture=u.Attributes?.find(a=>a.Name==='picture')?.Value||'';
  const publicId=/^[a-f0-9-]{36}$/i.test(sub)?`admin-${createHash('sha256').update(sub).digest('hex').slice(0,32)}`:undefined;
  const photoUrl=publicId?await adminPhotoUrl(sub,picture):'';
  return {name:info.name,publicId,photoUrl};
 }));administrators.push(...published.filter((x):x is NonNullable<typeof x>=>x!==null));token=r.NextToken;if(administrators.length>500&&token)throw httpError(413,'Administrator directory too large')}while(token);
 const publishedTeachers=await Promise.all(teachers.filter(x=>x.active===true&&Array.isArray(x.institutions)&&x.institutions.includes(inst)).map(async x=>{
  const item=publicTeacher(x);
  const publicId=typeof x.id==='string'&&/^TEACHER-[0-9a-f-]{36}$/i.test(x.id)?x.id:undefined;
  const sub=typeof x.cognitoSub==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.cognitoSub)?x.cognitoSub:'';
  // A teacher without a verified registry-linked login has no account photo.
  const photoUrl=publicId&&sub?await ownProfilePhoto(sub):'';
  return {...item,publicId,photoUrl};
 }));
 return {institution:inst,administrators:administrators.sort((a,b)=>a.name.localeCompare(b.name)),teachers:publishedTeachers.filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name)),venues:venues.filter(x=>x.active!==false).map(publicVenue).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name))};
}
