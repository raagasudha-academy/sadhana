import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand} from '@aws-sdk/lib-dynamodb';
import {entityTable} from './entityTables.mjs';
import {httpError} from './model.ts';

/** Read canonical people/family-links only. No legacy table names or PK/SK keys. */
export function makeM10FinalFamilyAccessReader(db:DynamoDBDocumentClient) {
  const get=async (entity:'people'|'family-links',key:string,id:string)=>
    (await db.send(new GetCommand({TableName:entityTable(entity),Key:{[key]:id},ConsistentRead:true}))).Item??null;
  const query=async (entity:'people'|'family-links',index:string,key:string,value:string)=>{
    const records:Record<string,any>[]=[];
    let cursor:Record<string,any>|undefined;
    do{
      const page=await db.send(new QueryCommand({TableName:entityTable(entity),IndexName:index,
        KeyConditionExpression:'#key=:value',ExpressionAttributeNames:{'#key':key},
        ExpressionAttributeValues:{':value':value},ExclusiveStartKey:cursor,Limit:100}));
      records.push(...(page.Items??[]));
      if(records.length>200)throw httpError(413,'Too many identity records; administrator review required.');
      cursor=page.LastEvaluatedKey;
    }while(cursor);
    return records;
  };
  return {
    peopleForSubject:(sub:string)=>query('people','CognitoIdentityIndex','cognitoSub',sub),
    person:(id:string)=>get('people','personId',id),
    linksForGuardian:(id:string)=>query('family-links','GuardianAccessIndex','guardianPersonId',id),
    link:(id:string)=>get('family-links','linkId',id),
  };
}
let cached:ReturnType<typeof makeM10FinalFamilyAccessReader>|undefined;
export function m10FinalFamilyAccessReader(){
  return cached??=makeM10FinalFamilyAccessReader(DynamoDBDocumentClient.from(
    new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),
    {marshallOptions:{removeUndefinedValues:true}}));
}
