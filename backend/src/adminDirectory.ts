/** Cognito is the authoritative administrator directory: no shadow role grants in DynamoDB. */
import {
  CognitoIdentityProviderClient, ListUsersInGroupCommand,
  AdminGetUserCommand, AdminListGroupsForUserCommand,
  AdminCreateUserCommand, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand, AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { demandInstitution, httpError } from './model.ts';
import {adminPhotoUrl} from './profilePhotos.ts';
import type { Claims, InstitutionId } from './model.ts';
import {adminGroup,canManageAdmins,requireAdminManager,readInstitution,validateInvite,validateAccessChange,validateAdminProfile,parseAdminTitle} from './adminPolicy.ts';

const cognito = new CognitoIdentityProviderClient({});
const pool=()=>{
  const id=process.env.SADHANA_COGNITO_USER_POOL_ID;
  if(!id)throw Error('SADHANA_COGNITO_USER_POOL_ID is missing');
  return id;
};
const superSub=()=>process.env.SADHANA_SUPER_ADMIN_SUB || '';
const attr=(attributes:readonly {Name?:string;Value?:string}[]|undefined,key:string) =>
  attributes?.find(a=>a.Name===key)?.Value||'';
const picture=(s:string)=>/^(teachers|admins)\/[a-z0-9][a-z0-9-]{0,70}\.png$/.test(s)?s:'';
const fullName=(a:readonly {Name?:string;Value?:string}[]|undefined,username:string)=>{
  const first=attr(a,'given_name').trim();
  const last=attr(a,'family_name').trim();
  const stored=attr(a,'name').trim();
  const fallback=[first,last].filter(Boolean).join(' ');
  const title=parseAdminTitle(stored);
  return (title?`${title} ${fallback||stored.replace(/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+/i,'')}`:fallback||stored)||username;
};

function cognitoError(error:unknown):never {
  const name=(error as {name?:string})?.name;
  if(name==='UsernameExistsException')throw httpError(409,'An account already exists. Use Grant existing account.');
  if(name==='UserNotFoundException')throw httpError(404,'Cognito account not found. Check its exact username.');
  if(name==='InvalidParameterException')throw httpError(400,'Cognito rejected the account details. Check the pool settings and values.');
  throw error;
}

export async function listAdministrators(instValue:unknown,claims:Claims) {
  const institution=readInstitution(instValue);
  demandInstitution(claims,institution);
  const records:{username:string;sub:string;displayName:string;title:string;firstName:string;lastName:string;photo:string;photoUrl:string;email:string;enabled:boolean;institution:InstitutionId;status:string}[]=[];
  let token:string|undefined;
  do{
    const result=await cognito.send(new ListUsersInGroupCommand({
      UserPoolId:pool(), GroupName:adminGroup[institution], Limit:60,
      ...(token?{NextToken:token}:{})
    }));
    for(const u of result.Users||[]){
      if(!u.Username)continue;
      records.push({username:u.Username,sub:attr(u.Attributes,'sub'),
        displayName:fullName(u.Attributes,u.Username),title:parseAdminTitle(attr(u.Attributes,'name')),
        firstName:attr(u.Attributes,'given_name'),lastName:attr(u.Attributes,'family_name'),
        photo:picture(attr(u.Attributes,'picture')),
        photoUrl:await adminPhotoUrl(attr(u.Attributes,'sub'),attr(u.Attributes,'picture')),
        email:attr(u.Attributes,'email'),enabled:u.Enabled!==false,
        institution,status:u.UserStatus||''});
    }
    token=result.NextToken;
    if(records.length>=500 && token)throw httpError(413,'Administrator directory pagination limit exceeded.');
  }while(token);
  return {records,canManage:canManageAdmins(claims,superSub())};
}

async function getAccount(username:string){
  try{
    return await cognito.send(new AdminGetUserCommand({UserPoolId:pool(),Username:username}));
  }catch(error){cognitoError(error);}
}
async function groupNames(username:string){
  const groups:string[]=[];
  let token:string|undefined;
  do{
    const result=await cognito.send(new AdminListGroupsForUserCommand({
      UserPoolId:pool(),Username:username,Limit:60,...(token?{NextToken:token}:{})
    }));
    groups.push(...(result.Groups||[]).map(g=>g.GroupName||'').filter(Boolean));
    token=result.NextToken;
    if(groups.length>=500&&token)throw httpError(413,'Too many account groups.');
  }while(token);
  return groups;
}

/** Existing login role update. No Cognito account is deleted or globally disabled. */
export async function changeAdministratorAccess(raw:Record<string,unknown>,claims:Claims){
  requireAdminManager(claims,superSub());
  const {username,institution,grant}=validateAccessChange(raw);
  const target=await getAccount(username);
  const targetSub=attr(target.UserAttributes,'sub');
  if(targetSub===superSub())throw httpError(403,'Cannot change the protected super-admin account.');
  const group=adminGroup[institution];
  const already=(await groupNames(username)).includes(group);
  if(already===grant)return {username,institution,granted:grant,unchanged:true};
  try{
    if(grant){await cognito.send(new AdminAddUserToGroupCommand({UserPoolId:pool(),Username:username,GroupName:group}));}
    else{await cognito.send(new AdminRemoveUserFromGroupCommand({UserPoolId:pool(),Username:username,GroupName:group}));}
  }catch(error){cognitoError(error);}
  return {username,institution,granted:grant,unchanged:false};
}

/** New Cognito invitation: one institution per operation, to avoid multi-group partial grants. */
export async function inviteAdministrator(raw:Record<string,unknown>,claims:Claims){
  requireAdminManager(claims,superSub());
  const {email,displayName,institution}=validateInvite(raw);
  let username:string;
  try{
    const result=await cognito.send(new AdminCreateUserCommand({
      UserPoolId:pool(), Username:email,
      UserAttributes:[{Name:'email',Value:email},{Name:'name',Value:displayName}],
      DesiredDeliveryMediums:['EMAIL'],
    }));
    username=result.User?.Username||email;
  }catch(error){cognitoError(error);}
  try{
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId:pool(),Username:username,GroupName:adminGroup[institution]
    }));
  }catch(error){
    // The invited Cognito user may exist even when the group grant fails.
    console.error('Admin invitation created but group grant failed',{errorName:(error as Error).name});
    throw httpError(409,`Invitation created for ${email}, but academy access could not be granted. Check the Cognito user before retrying.`);
  }
  return {username,institution,invited:true};
}

/** Updates only presentation metadata. Never modifies roles, passwords or group memberships. */
export async function updateAdministratorProfile(raw:Record<string,unknown>,claims:Claims){
  requireAdminManager(claims,superSub());
  const {username,firstName,lastName,title}=validateAdminProfile(raw);
  const target=await getAccount(username);
  if(target.Enabled===false)throw httpError(409,'This account is disabled.');
  const memberships=await groupNames(username);
  if(!memberships.includes(adminGroup.raaga)&&!memberships.includes(adminGroup.sruti))
    throw httpError(403,'Only existing academy administrator profiles may be edited.');
  try{
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId:pool(),Username:username,
      UserAttributes:[
        {Name:'given_name',Value:firstName},
        {Name:'family_name',Value:lastName},
        {Name:'name',Value:`${title?`${title} `:''}${firstName} ${lastName}`},
      ],
    }));
  }catch(error){cognitoError(error);}
  console.info('Administrator profile metadata updated',{username,actor:claims.sub});
  return {username,updated:true};
}
