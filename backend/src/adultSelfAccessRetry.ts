/** Retry verified adult self-linking after Cognito email verification.
 * Never grants child/guardian access; the imported resolver performs all checks.
 */
import {QueryCommand} from '@aws-sdk/lib-dynamodb';
import {makeRoutedClient} from './tableRouter.ts';
import {enqueueImportedGuardianReviews} from './v117GuardianQueue.ts';
import {isAccountSubject} from './accessRules.ts';
const db=makeRoutedClient();
const table=()=>{const name=process.env.SADHANA_TABLE_NAME;if(!name)throw Error('Missing Sadhana table');return name};

export async function retryVerifiedAdultSelfAccess(subject:string,institution:string){
 if(institution!=='raaga'||!isAccountSubject(subject))return {checked:0,eligible:0};
 let cursor:Record<string,unknown>|undefined;
 let checked=0,eligible=0;
 do{
  const page=await db.send(new QueryCommand({TableName:table(),KeyConditionExpression:'PK = :pk',
   ExpressionAttributeValues:{':pk':'OPS#GLOBAL#WEB_IMPORT'},ConsistentRead:true,
   Limit:100,ExclusiveStartKey:cursor}));
  for(const marker of page.Items||[]){
   checked++;
   if(checked>10000)throw Error('Adult self-access lookup limit exceeded');
   if(marker.parentAccountSub!==subject||marker.independentAdult!==true||
      !['INVITATION_SENT','ACCOUNT_FOUND','ACTIVE'].includes(marker.parentAccessStatus)||
      typeof marker.registrationId!=='string')continue;
   eligible++;
   // Fail closed on conflicting identity evidence. Resolver validates the live
   // approved website import, Cognito verified email, precise person mapping,
   // current student record and prior access record before any transactional write.
   await enqueueImportedGuardianReviews(marker.registrationId);
  }
  cursor=page.LastEvaluatedKey;
 }while(cursor);
 return {checked,eligible};
}
