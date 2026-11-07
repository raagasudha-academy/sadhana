/** Canonical guardian queue I/O only: strong base-table re-reads and scoped
 * Cognito identity verification; no legacy PK/SK keys or table routing. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,ScanCommand,PutCommand} from '@aws-sdk/lib-dynamodb';
import {CognitoIdentityProviderClient,ListUsersCommand} from '@aws-sdk/client-cognito-identity-provider';
import {guardianLinkId} from './m95WebsiteImportCore.mjs';
import {entityTable} from './m10EntityTables.mjs';
import {httpError} from './model.ts';

export function makeM10FinalGuardianQueueReader(db:{send:(command:any)=>Promise<any>},cognito:{send:(command:any)=>Promise<any>}){
 return {
  guardianLinkId:(inst:string,guardian:string,student:string)=>guardianLinkId(inst,guardian,student),
  async createPendingSruti({linkId,guardianPersonId,studentId,familyId}:{linkId:string;guardianPersonId:string;studentId:string;familyId:string}){
   const timestamp=new Date().toISOString();
   const item={linkId,recordType:'guardian-access',institutionId:'sruti',familyId,personId:guardianPersonId,guardianPersonId,studentId,relationship:'unverified',accessStatus:'pending',relationshipVerified:false,createdAt:timestamp,updatedAt:timestamp,version:1};
   try{await db.send(new PutCommand({TableName:entityTable('family-links'),Item:item,ConditionExpression:'attribute_not_exists(linkId)'}));}
   catch(err:any){if(err?.name!=='ConditionalCheckFailedException')throw err;throw httpError(409,'Sruti request already exists; refresh the queue.');}
   return {status:'pending',submitted:true};
  },
  async links(){
   const items:any[]=[];let cursor:any;
   do{
    const page=await db.send(new ScanCommand({TableName:entityTable('family-links'),ConsistentRead:true,Limit:100,ExclusiveStartKey:cursor}));
    items.push(...(page.Items||[]));cursor=page.LastEvaluatedKey;
    if(items.length>2000)throw httpError(413,'Guardian queue exceeds safe review limit.');
   }while(cursor);
   return items;
  },
  async link(id:string){return (await db.send(new GetCommand({TableName:entityTable('family-links'),Key:{linkId:id},ConsistentRead:true}))).Item??null;},
  async person(id:string){return (await db.send(new GetCommand({TableName:entityTable('people'),Key:{personId:id},ConsistentRead:true}))).Item??null;},
  async peopleForSubject(subject:string){
   const result=await db.send(new QueryCommand({TableName:entityTable('people'),IndexName:'CognitoIdentityIndex',
    KeyConditionExpression:'cognitoSub=:sub',ExpressionAttributeValues:{':sub':subject},Limit:3}));
   if(result.LastEvaluatedKey||result.Items?.length>2)throw httpError(409,'Ambiguous guardian account.');
   return result.Items||[];
  },
  async verifiedIdentity(subject:string){
   const pool=process.env.SADHANA_COGNITO_USER_POOL_ID;
   if(!pool)throw httpError(503,'Cognito identity directory unavailable.');
   const response=await cognito.send(new ListUsersCommand({UserPoolId:pool,Filter:`sub = "${subject}"`,Limit:2}));
   const users=(response.Users||[]).filter((u:any)=>u.Attributes?.some((a:any)=>a.Name==='sub'&&a.Value===subject));
   if(users.length!==1||users[0].Enabled===false||users[0].UserStatus!=='CONFIRMED')return null;
   const attr=(key:string)=>users[0].Attributes?.find((a:any)=>a.Name===key)?.Value?.trim()||'';
   const email=attr('email'),name=attr('name')||[attr('given_name'),attr('family_name')].filter(Boolean).join(' ');
   if(attr('email_verified')!=='true'||!email.includes('@')||!name)return null;
   return {name,email,verified:true as const};
  },
 };
}
let cached:ReturnType<typeof makeM10FinalGuardianQueueReader>|undefined;
export function m10FinalGuardianQueueReader(){
 return cached??=makeM10FinalGuardianQueueReader(
  DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}}),
  new CognitoIdentityProviderClient({region:process.env.AWS_REGION||'us-east-1'})
 );
}
