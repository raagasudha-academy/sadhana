/** M9 opt-in conditional-write repository. Not wired to legacy repositories. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {M9_TARGET_KEYS} from './m9TargetRepository.ts';
import type {M9Entity} from './m9TargetRepository.ts';

export type M9WriteClient=Pick<DynamoDBDocumentClient,'send'>;
export const M9_ENTITY_NAMES=Object.keys(M9_TARGET_KEYS) as M9Entity[];
export type M9WriteEnvironment='dev'|'test';
export type M9EntityItem=Record<string,unknown>;
function enabled(optIn:boolean){
 if(!optIn||process.env.M9_TARGET_REPOSITORY_WRITES!=='enabled')throw Error('M9 repository writes disabled');
}
function validId(x:unknown){return typeof x==='string'&&x.length>0&&x.length<=180&&/^[a-zA-Z0-9_#.:\-]+$/.test(x);}
function allowedEntity(x:string):x is M9Entity{return Object.hasOwn(M9_TARGET_KEYS,x);}
function plainObject(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function validVersion(x:unknown):x is number{return Number.isSafeInteger(x)&&typeof x==='number'&&x>=1;}
export function makeM9TargetWriter(client:M9WriteClient,options:{env?:M9WriteEnvironment;enabled?:boolean}={}){
 const env=options.env??'dev';if(!['dev','test'].includes(env))throw Error('Unsupported M9 environment');
 const check=()=>enabled(options.enabled===true);
 const table=(entity:M9Entity)=>{if(!allowedEntity(entity))throw Error('Unknown M9 table');return `sadhana-${env}-m9-${entity}`;};
 return {
  async create(entity:M9Entity,item:M9EntityItem){
   check();if(!plainObject(item))throw Error('Record must be an object');
   const pk=M9_TARGET_KEYS[entity]; const id=item[pk];
   if(!validId(id))throw Error(`Invalid ${pk}`);
   if(item.version!==undefined&&item.version!==1)throw Error('New record version must be 1');
   if(item.createdAt!==undefined&&typeof item.createdAt!=='string')throw Error('Invalid createdAt');
   const stored={...item,version:1};
   await client.send(new PutCommand({TableName:table(entity),Item:stored,ConditionExpression:'attribute_not_exists(#pk)',ExpressionAttributeNames:{'#pk':pk}}));
   return stored;
  },
  async update(entity:M9Entity,id:string,expectedVersion:number,changes:M9EntityItem,institutionId?:string){
   check();if(!validId(id))throw Error('Invalid record identifier');
   if(!validVersion(expectedVersion))throw Error('Expected version required');
   if(!plainObject(changes)||!Object.keys(changes).length)throw Error('Nonempty changes object required');
   if(institutionId!==undefined && !['raaga','sruti'].includes(institutionId))throw Error('Invalid institution scope');
   const pk=M9_TARGET_KEYS[entity];
   const immutable=new Set([pk,'institutionId','institutionIds','createdAt','version','cognitoSub','actorCognitoSub','auditId','counterId']);
   for(const key of Object.keys(changes)){
    if(immutable.has(key)||key.startsWith('GSI')||key==='PK'||key==='SK'||key==='updatedAt')throw Error(`Immutable or reserved field: ${key}`);
    if(changes[key]===undefined)throw Error(`Undefined field: ${key}`);
   }
   const names:Record<string,string>={'#pk':pk,'#version':'version','#updatedAt':'updatedAt'};
   const values:Record<string,unknown>={':expected':expectedVersion,':next':expectedVersion+1,':now':new Date().toISOString()};
   if(institutionId!==undefined){names['#institutionId']='institutionId';values[':institutionId']=institutionId;}
   const assignments=['#version = :next','#updatedAt = :now'];
   Object.entries(changes).forEach(([key,value],i)=>{names[`#f${i}`]=key;values[`:v${i}`]=value;assignments.push(`#f${i} = :v${i}`);});
   const result=await client.send(new UpdateCommand({TableName:table(entity),Key:{[pk]:id},UpdateExpression:`SET ${assignments.join(', ')}`,ConditionExpression:'attribute_exists(#pk) AND #version = :expected'+(institutionId!==undefined?' AND #institutionId = :institutionId':''),ExpressionAttributeNames:names,ExpressionAttributeValues:values,ReturnValues:'ALL_NEW'}));
   return result.Attributes??null;
  }
 };
}
export function makeM9TargetWriterClient(region='us-east-1'){
 return DynamoDBDocumentClient.from(new DynamoDBClient({region}),{marshallOptions:{removeUndefinedValues:true}});
}
