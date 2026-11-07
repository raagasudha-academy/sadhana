/** Read-only canonical account-status adapter for the existing Raaga website UI. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './m10EntityTables.mjs';
import {markerId} from './m95WebsiteImportCore.mjs';
import {finalRaagaParentStatusProjection} from './m10FinalRaagaParentStatus.mjs';

const client=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{
 marshallOptions:{removeUndefinedValues:true}
});

export async function finalRaagaParentStatus(externalRegistrationId:string){
 // Validate before querying AWS and before forming the hashed canonical ID.
 if(!/^RS-[A-Za-z0-9_-]{1,110}$/.test(externalRegistrationId))
  return finalRaagaParentStatusProjection(externalRegistrationId,null);
 const item=await client.send(new GetCommand({
  TableName:entityTable('registrations'),
  Key:{registrationId:markerId('raaga',externalRegistrationId)},
  ConsistentRead:true,
  ProjectionExpression:'registrationId,institutionId,externalRegistrationId,#src,importStatus,familyId,studentIds,provisioningStatus,provisioningUpdatedAt',
  ExpressionAttributeNames:{'#src':'source'}
 }));
 return finalRaagaParentStatusProjection(externalRegistrationId,item.Item);
}
