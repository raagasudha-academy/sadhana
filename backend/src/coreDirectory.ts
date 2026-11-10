import {entityTable} from './entityTables.mjs';
/** Admin-only M9 directory shadow reader; leaves legacy API responses unchanged. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {demandInstitution} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';
import {projectM10Directory} from './coreDirectoryProjection.mjs';
export type M10CoreEntity='students'|'families'|'enrolments';
export type M10Client={send:(cmd:any)=>Promise<any>};
const physical:Record<M10CoreEntity,string>={students:'people',families:'families',enrolments:'enrolments'};
const maxRows:Record<M10CoreEntity,number>={students:1500,families:1000,enrolments:3000};
export function makeM10CoreDirectoryReader(client:M10Client){
 return {
  async list(entity:M10CoreEntity,inst:InstitutionId,claims:Claims){
   demandInstitution(claims,inst);
   const records:any[]=[];let cursor:Record<string,unknown>|undefined;
   do {
    const response=await client.send(new ScanCommand({TableName:entityTable(physical[entity]),ConsistentRead:true,Limit:200,ExclusiveStartKey:cursor}));
    records.push(...(response.Items||[]));cursor=response.LastEvaluatedKey;
    if(records.length>maxRows[entity])throw Error('M10_CORE_DIRECTORY_ROW_LIMIT');
   }while(cursor);
   let contacts:any[]=[];
   if(entity==='families'){
    let contactCursor:Record<string,unknown>|undefined;
    do {
     const result=await client.send(new ScanCommand({TableName:entityTable('people'),ConsistentRead:true,Limit:200,ExclusiveStartKey:contactCursor}));
     contacts.push(...(result.Items||[]));contactCursor=result.LastEvaluatedKey;
     if(contacts.length>1500)throw Error('M10_CORE_CONTACT_ROW_LIMIT');
    }while(contactCursor);
   }
   return projectM10Directory(entity,records,inst,contacts) as {records:Record<string,any>[];more:false};
  }
 };
}
export type M10CoreDirectoryReader=ReturnType<typeof makeM10CoreDirectoryReader>;
export function defaultM10CoreDirectoryReader():M10CoreDirectoryReader{
 const client=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
 return makeM10CoreDirectoryReader(client);
}
