/** Read-only M9 teacher/venue compatibility, independent of the legacy router. */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,ScanCommand} from '@aws-sdk/lib-dynamodb';
import {signedProfilePhoto} from './profilePhotos.ts';
import {legacyRecord,canonicalRecords} from './m95Compatibility.ts';
import type {CompatibleItem,CompatClient} from './m95Compatibility.ts';
import type {Claims,InstitutionId} from './model.ts';
import {demandViewInstitution,permittedInstitutions} from './model.ts';

export type DirectoryEntity='people'|'venues';
const MAX_ROWS:Record<DirectoryEntity,number>={people:1000,venues:500};
const teacherSub=(row:Record<string,any>)=>typeof row.cognitoSub==='string'?row.cognitoSub:'';

/** Old /teachers projection, without leaking a teacher's Cognito subject to viewers. */
export async function presentM9Teachers(inst:InstitutionId,claims:Claims,items:CompatibleItem[],photo:(sub:string)=>Promise<string>=signedProfilePhoto){
 demandViewInstitution(claims,inst);
 const admin=permittedInstitutions(claims).includes(inst);
 const candidates=items.filter(x=>Array.isArray((x as any).personTypes)&&(x as any).personTypes.includes('teacher')).map(x=>legacyRecord(x)).filter(x=>Array.isArray(x.institutions)&&x.institutions.includes(inst));
 return {records:await Promise.all(candidates.map(async row=>({
  ...row,
  cognitoSub:admin?teacherSub(row):'',
  photoUrl:teacherSub(row)?await photo(teacherSub(row)):'',
 }))),more:false as const};
}

export function presentM9TeacherIdentity(inst:InstitutionId,claims:Claims,items:CompatibleItem[]){
 demandViewInstitution(claims,inst);
 const match=items.filter(x=>Array.isArray((x as any).personTypes)&&(x as any).personTypes.includes('teacher')).map(x=>legacyRecord(x)).find(row=>row.active===true&&row.cognitoSub===claims.sub&&Array.isArray(row.institutions)&&row.institutions.includes(inst));
 return {linked:!!match,teacherId:match?.id??null};
}

/** Old /venues response: shared venues are never restricted by a guessed institutionIds field. */
export function presentM9Venues(inst:InstitutionId,claims:Claims,items:CompatibleItem[]){
 demandViewInstitution(claims,inst);
 return {records:items.map(x=>{const {GSI1PK,GSI1SK,GSI2PK,GSI2SK,...publicVenue}=legacyRecord(x);return publicVenue;}),more:false as const};
}

/** Compare business data rather than signed S3 URLs (which can change on each request). */
export function sameDirectoryRows(a:ReadonlyArray<Record<string,any>>,b:ReadonlyArray<Record<string,any>>){
 const clean=(rows:ReadonlyArray<Record<string,any>>)=>rows.map(({photoUrl,...rest})=>rest);
 return canonicalRecords(clean(a))===canonicalRecords(clean(b));
}

export function makeM95DirectoryReader(client:CompatClient,photo:(sub:string)=>Promise<string>=signedProfilePhoto){
 const scan=async(entity:DirectoryEntity):Promise<CompatibleItem[]>=>{
  const records:CompatibleItem[]=[];
  let cursor:Record<string,unknown>|undefined;
  do{
   const res=await client.send(new ScanCommand({TableName:`sadhana-dev-m9-${entity}`,ConsistentRead:true,ExclusiveStartKey:cursor,Limit:200}));
   records.push(...(res.Items??[])); cursor=res.LastEvaluatedKey;
   if(records.length>MAX_ROWS[entity])throw Error(`M95_DIRECTORY_LIMIT_EXCEEDED_${entity}`);
  }while(cursor);
  return records;
 };
 return {
  async teachers(inst:InstitutionId,claims:Claims){demandViewInstitution(claims,inst);return presentM9Teachers(inst,claims,await scan('people'),photo);},
  async teacherMe(inst:InstitutionId,claims:Claims){demandViewInstitution(claims,inst);return presentM9TeacherIdentity(inst,claims,await scan('people'));},
  async venues(inst:InstitutionId,claims:Claims){demandViewInstitution(claims,inst);return presentM9Venues(inst,claims,await scan('venues'));},
 };
}
export type M95DirectoryReader=ReturnType<typeof makeM95DirectoryReader>;
export function defaultM95DirectoryReader():M95DirectoryReader{
 const client=DynamoDBDocumentClient.from(new DynamoDBClient({region:process.env.AWS_REGION||'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
 return makeM95DirectoryReader(client);
}
