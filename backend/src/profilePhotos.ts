import {makeRoutedClient} from './tableRouter.ts';
/** Private S3 profile photos. The caller's verified JWT decides whose photo may be changed. */
import {S3Client,HeadObjectCommand,PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,AdminGetUserCommand,AdminListGroupsForUserCommand,
  AdminUpdateUserAttributesCommand,ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';
import {httpError} from './model.ts';
import type {Claims} from './model.ts';
import {adminGroup,requireAdminManager} from './adminPolicy.ts';
import {photoKey,storedPhotoIsValid,validatePhotoPayload,requireTeacherPhotoPermission} from './profilePhotoRules.ts';

const s3=new S3Client({});
const cognito=new CognitoIdentityProviderClient({});
const db=makeRoutedClient();
const bucket=()=>{
  const name=process.env.SADHANA_PROFILE_PHOTOS_BUCKET;
  if(!name)throw Error('SADHANA_PROFILE_PHOTOS_BUCKET not configured.');
  return name;
};
const pool=()=>{
  const name=process.env.SADHANA_COGNITO_USER_POOL_ID;
  if(!name)throw Error('Cognito pool not configured.');
  return name;
};
const getSub=(a:readonly {Name?:string;Value?:string}[]|undefined)=>
  a?.find(v=>v.Name==='sub')?.Value||'';

export async function signedProfilePhoto(sub:string):Promise<string>{
  if(!process.env.SADHANA_PROFILE_PHOTOS_BUCKET)return '';
  return getSignedUrl(s3,new GetObjectCommand({Bucket:bucket(),Key:photoKey(sub)}),{expiresIn:600});
}

/** Read the current profile name, including its title, rather than a stale JWT claim. */
export async function currentStaffDisplayName(sub:string):Promise<string>{
  photoKey(sub);
  const result=await cognito.send(new ListUsersCommand({
    UserPoolId:pool(),Filter:`sub = "${sub}"`,Limit:2
  }));
  const user=result.Users?.[0];
  if(!user||result.Users?.length!==1||getSub(user.Attributes)!==sub)
    throw httpError(404,'Signed-in staff profile not found.');
  const attr=(key:string)=>user.Attributes?.find(a=>a.Name===key)?.Value?.trim()||'';
  return (attr('name')||[attr('given_name'),attr('family_name')].filter(Boolean).join(' ')||user.Username||'Staff').slice(0,100);
}
/** Only create a signed URL for an existing image on the user's own /me page. */
export async function ownProfilePhoto(sub:string):Promise<string>{
  if(!process.env.SADHANA_PROFILE_PHOTOS_BUCKET)return '';
  try{await s3.send(new HeadObjectCommand({Bucket:bucket(),Key:photoKey(sub)}));}
  catch(error){
    if(['NotFound','NoSuchKey'].includes((error as {name?:string}).name||'') ||
       (error as { $metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404)return '';
    throw error;
  }
  return signedProfilePhoto(sub);
}

export async function adminPhotoUrl(sub:string,picture:unknown):Promise<string>{
  if(!sub || !storedPhotoIsValid(picture,sub))return '';
  return signedProfilePhoto(sub);
}

async function usernameBySub(sub:string):Promise<string>{
  photoKey(sub); // validate the untrusted field before using it in a filter
  const r=await cognito.send(new ListUsersCommand({
    UserPoolId:pool(),Filter:`sub = "${sub}"`,Limit:2
  }));
  if(!r.Users?.length || r.Users.length!==1 || !r.Users[0].Username ||
     getSub(r.Users[0].Attributes)!==sub)
    throw httpError(404,'Signed-in staff account not found in Cognito.');
  return r.Users[0].Username;
}

async function adminTarget(username:string):Promise<{username:string;sub:string}>{
  if(!username||username.length>128||/[\u0000-\u001f]/.test(username))
    throw httpError(400,'Choose a valid existing administrator username.');
  let user;
  try {user=await cognito.send(new AdminGetUserCommand({UserPoolId:pool(),Username:username}));}
  catch(error){if((error as Error).name==='UserNotFoundException')throw httpError(404,'Administrator not found.');throw error;}
  if(!user.Enabled)throw httpError(409,'This administrator account is disabled.');
  const sub=getSub(user.UserAttributes);
  photoKey(sub);
  const groups=await cognito.send(new AdminListGroupsForUserCommand({UserPoolId:pool(),Username:username}));
  if(!(groups.Groups||[]).some(g=>g.GroupName===adminGroup.raaga||g.GroupName===adminGroup.sruti))
    throw httpError(403,'The target must be an existing academy administrator.');
  return {username,sub};
}

/** An administrator may update a registered teacher's picture only if authorised for
 * every institution on that teacher record. The teacher MUST have a Cognito link.
 * Neither a user-supplied Cognito sub nor a username is accepted here.
 */
async function teacherPhotoTarget(teacherId:string,claims:Claims):Promise<{sub:string;username:string}>{
  if(!/^TEACHER-[0-9a-f-]{36}$/i.test(teacherId))
    throw httpError(400,'Invalid teacher profile ID.');
  const table=process.env.SADHANA_TABLE_NAME;
  if(!table)throw Error('SADHANA_TABLE_NAME is missing.');
  const response=await db.send(new GetCommand({
    TableName:table,Key:{PK:'TEACHER_REGISTRY',SK:`TEACHER#${teacherId}`},ConsistentRead:true
  }));
  const teacher=response.Item;
  if(!teacher)throw httpError(404,'Registered teacher not found.');
  const sub=requireTeacherPhotoPermission(teacher,claims);
  return {sub,username:await usernameBySub(sub)};
}

/** Upload JPEG only; the portal converts JPG/PNG/WebP locally before calling us. */
export async function uploadProfilePhoto(value:unknown,claims:Claims,mode:'me'|'administrator'|'teacher'){
  if(mode==='administrator')requireAdminManager(claims,process.env.SADHANA_SUPER_ADMIN_SUB||'');
  const raw=value as Record<string,unknown>;
  if(mode==='me' && raw && ('username' in raw||'teacherId' in raw))
    throw httpError(400,'You may only upload your own profile photo.');
  if(mode==='teacher' && (!raw||'username' in raw||typeof raw.teacherId!=='string'))
    throw httpError(400,'Choose a linked teacher profile.');
  if(mode==='administrator' && (!raw||'teacherId' in raw))
    throw httpError(400,'Choose an existing administrator.');
  const jpeg=validatePhotoPayload(value);
  let sub=claims.sub||'';
  let username='';
  if(mode==='administrator'){
    ({sub,username}=await adminTarget(String(raw?.username||'')));
  }else if(mode==='teacher'){
    ({sub,username}=await teacherPhotoTarget(raw.teacherId as string,claims));
  }else{
    username=await usernameBySub(sub);
  }
  const key=photoKey(sub);
  // A failed Cognito metadata update may leave a private orphan image, not an access grant.
  await s3.send(new PutObjectCommand({
    Bucket:bucket(),Key:key,Body:jpeg,ContentType:'image/jpeg',
    CacheControl:'private, max-age=60',ServerSideEncryption:'AES256'
  }));
  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId:pool(),Username:username,
    UserAttributes:[{Name:'picture',Value:`s3:${key}`}]
  }));
  console.info('Sadhana profile photo updated',{actor:claims.sub,target:sub,mode});
  return {photoUrl:await signedProfilePhoto(sub),updated:true};
}
