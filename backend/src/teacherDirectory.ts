import {makeRoutedClient} from './tableRouter.ts';
/** Admin-owned teacher registry. Names are never authorization keys. */
import {randomUUID} from 'node:crypto';
import {signedProfilePhoto} from './profilePhotos.ts';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import {
  clean, demandAnyAdmin, demandInstitution,
  demandViewInstitution, httpError, permittedInstitutions
} from './model.ts';
import type {Claims,InstitutionId} from './model.ts';

const db=makeRoutedClient();

const table=()=>{
  if(!process.env.SADHANA_TABLE_NAME)
    throw Error('SADHANA_TABLE_NAME is missing');
  return process.env.SADHANA_TABLE_NAME;
};

const teacherKey=(id:string)=>({
  PK:'TEACHER_REGISTRY',
  SK:`TEACHER#${id}`
});

const identityKey=(sub:string)=>({
  PK:`TEACHER_SUB#${sub}`,
  SK:'LINK'
});

export interface TeacherRecord {
  id:string;
  displayName:string;
  institutions:InstitutionId[];
  subjects:string[];
  aliases:string[];
  cognitoSub:string;
  active:boolean;
  version:number;
  createdAt:string;
  updatedAt:string;
  photoUrl?:string;
}

function present(raw:Record<string,any>,showSub:boolean):TeacherRecord{
  const {PK,SK,entityType,...record}=raw;
  if(!showSub)record.cognitoSub='';
  return record as TeacherRecord;
}

async function findTeacher(id:string):Promise<TeacherRecord|null>{
  if(!/^TEACHER-[0-9a-f-]{36}$/i.test(id))
    throw httpError(400,'Invalid teacher ID.');

  const response=await db.send(new GetCommand({
    TableName:table(),
    Key:teacherKey(id),
    ConsistentRead:true
  }));

  return response.Item?present(response.Item,true):null;
}

/** Resolve the authenticated login privately; never expose directory Cognito subjects. */
export async function myTeacherIdentity(inst:InstitutionId,claims:Claims){
 demandViewInstitution(claims,inst);
 const link=await db.send(new GetCommand({TableName:table(),Key:identityKey(claims.sub),ConsistentRead:true}));
 const teacherId=link.Item?.teacherId;
 if(typeof teacherId!=='string')return {linked:false,teacherId:null};
 const teacher=await findTeacher(teacherId);
 if(!teacher||!teacher.active||teacher.cognitoSub!==claims.sub||!teacher.institutions.includes(inst))
  return {linked:false,teacherId:null};
 return {linked:true,teacherId:teacher.id};
}

export async function listTeachers(
  inst:InstitutionId,
  claims:Claims
){
  demandViewInstitution(claims,inst);

  const found:TeacherRecord[]=[];
  let next:Record<string,any>|undefined;

  do{
    const response=await db.send(new QueryCommand({
      TableName:table(),
      KeyConditionExpression:'PK=:pk AND begins_with(SK,:p)',
      ExpressionAttributeValues:{
        ':pk':'TEACHER_REGISTRY',
        ':p':'TEACHER#'
      },
      ExclusiveStartKey:next,
      Limit:100,
      ConsistentRead:true
    }));

    found.push(...(response.Items||[]).map(x=>present(x,true)));
    next=response.LastEvaluatedKey;

    if(found.length>1000)
      throw httpError(413,'Teacher directory size limit exceeded.');
  }while(next);

  const admin=permittedInstitutions(claims).includes(inst);

  const records=await Promise.all(found.filter(t=>t.institutions.includes(inst)).map(async t=>({
    ...(admin?t:{...t,cognitoSub:''}),
    photoUrl:t.cognitoSub?await signedProfilePhoto(t.cognitoSub):''
  })));
  return {records,more:false};
}

function parse(
  input:Record<string,unknown>,
  claims:Claims,
  current?:TeacherRecord
){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw httpError(400,'Teacher details must be an object.');

  const allowed=new Set([
    'displayName','institutions','subjects',
    'aliases','cognitoSub','active','expectedVersion'
  ]);

  if(Object.keys(input).some(k=>!allowed.has(k)))
    throw httpError(400,'Unknown teacher field.');

  const displayName=typeof input.displayName==='string'
    ?clean(input.displayName):'';

  const rawInst=input.institutions;

  if(!Array.isArray(rawInst)||
     !rawInst.length||
     rawInst.length>2||
     rawInst.some(x=>x!=='raaga'&&x!=='sruti'))
    throw httpError(400,'Select valid institutions.');

  const institutions=[...new Set(rawInst)] as InstitutionId[];

  function strings(
    value:unknown,
    maxItems:number,
    maxChars:number
  ){
    if(!Array.isArray(value)||
       value.length>maxItems||
       value.some(x=>typeof x!=='string'))
      throw httpError(400,'Invalid teacher list field.');

    const items=[...new Set(value.map(x=>clean(x)))];

    if(items.some(x=>!x||x.length>maxChars))
      throw httpError(400,'Teacher list field is empty or too long.');

    return items;
  }

  const subjects=strings(input.subjects,10,60);
  const aliases=strings(input.aliases,12,100);

  const cognitoSub=typeof input.cognitoSub==='string'
    ?clean(input.cognitoSub):'';

  if(!displayName||
     displayName.length>100||
     !subjects.length)
    throw httpError(400,'Name and teaching subject are required.');

  if(cognitoSub&&
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cognitoSub))
    throw httpError(400,'Use the Cognito sub, not an email.');

  if(typeof input.active!=='boolean')
    throw httpError(400,'Choose active or inactive.');

  const affected=[
    ...new Set([
      ...(current?.institutions||[]),
      ...institutions
    ])
  ];

  for(const inst of affected)
    demandInstitution(claims,inst);

  return {
    displayName,
    institutions,
    subjects,
    aliases,
    cognitoSub,
    active:input.active
  };
}

export async function saveTeacher(
  input:Record<string,unknown>,
  claims:Claims,
  id?:string
){
  demandAnyAdmin(claims);

  const current=id?await findTeacher(id):null;

  if(id&&!current)
    throw httpError(404,'Teacher not found.');

  if(current&&input.expectedVersion!==current.version)
    throw httpError(409,'Teacher changed; refresh before editing.');

  const parsed=parse(input,claims,current||undefined);
  const now=new Date().toISOString();

  const next:TeacherRecord={
    ...parsed,
    id:current?.id||`TEACHER-${randomUUID()}`,
    version:(current?.version||0)+1,
    createdAt:current?.createdAt||now,
    updatedAt:now
  };

  const writes:any[]=[{
    Put:{
      TableName:table(),
      Item:{
        ...teacherKey(next.id),
        entityType:'teacher',
        ...next
      },
      ConditionExpression:current
        ?'#v=:old'
        :'attribute_not_exists(PK)',
      ...(current?{
        ExpressionAttributeNames:{'#v':'version'},
        ExpressionAttributeValues:{':old':current.version}
      }:{})
    }
  }];

  if(current?.cognitoSub&&
     current.cognitoSub!==next.cognitoSub){
    writes.push({
      Delete:{
        TableName:table(),
        Key:identityKey(current.cognitoSub),
        ConditionExpression:'teacherId=:id',
        ExpressionAttributeValues:{':id':next.id}
      }
    });
  }

  if(next.cognitoSub&&
     next.cognitoSub!==current?.cognitoSub){
    writes.push({
      Put:{
        TableName:table(),
        Item:{
          ...identityKey(next.cognitoSub),
          teacherId:next.id
        },
        ConditionExpression:'attribute_not_exists(PK)'
      }
    });
  }

  for(const inst of next.institutions){
    writes.push({
      Put:{
        TableName:table(),
        Item:{
          PK:`AUDIT#${inst}`,
          SK:`TEACHER#${now}#${randomUUID()}`,
          entityType:'audit',
          action:current?'updateTeacher':'createTeacher',
          teacherId:next.id,
          actor:claims.sub,
          at:now
        },
        ConditionExpression:'attribute_not_exists(PK)'
      }
    });
  }

  try{
    await db.send(new TransactWriteCommand({
      TransactItems:writes
    }));
  }catch(e){
    if((e as Error).name==='TransactionCanceledException')
      throw httpError(
        409,
        'Teacher changed or Cognito account already linked.'
      );
    throw e;
  }

  return {record:next};
}

export async function validateTeacherAssignment(
  id:string,
  inst:InstitutionId
){
  const teacher=await findTeacher(id);

  if(!teacher||
     !teacher.active||
     !teacher.institutions.includes(inst))
    throw httpError(
      400,
      'Choose an active registered teacher for this institution.'
    );

  return teacher;
}

/** Role discovery for the authenticated user; reads only the stable subject-to-teacher link. */
export async function verifiedTeacherInstitutions(sub:string):Promise<InstitutionId[]>{
 if(!sub)return [];
 const lookup=await db.send(new GetCommand({TableName:table(),Key:identityKey(sub),ConsistentRead:true}));
 const teacherId=lookup.Item?.teacherId;
 if(typeof teacherId!=='string')return [];
 const teacher=await findTeacher(teacherId);
 if(!teacher||!teacher.active||teacher.cognitoSub!==sub)return [];
 return teacher.institutions.filter(i=>i==='raaga'||i==='sruti');
}
