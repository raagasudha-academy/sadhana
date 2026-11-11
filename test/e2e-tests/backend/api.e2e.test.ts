import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createHandler} from '../../../backend/src/lambda.ts';
import {SadhanaRepository} from '../../../backend/src/repository.ts';
import {makeFinalCascadeDeletionService} from '../../../backend/src/finalCascadeDeletionService.mjs';

type Row=Record<string,any>;
const rows=new Map<string,Row>();
const keyOf=(row:Row)=>`${row.PK}\u0000${row.SK}`;
let commandCount=0;
const finalKeys:Record<string,string>={people:'personId',families:'familyId','family-links':'linkId',enrolments:'enrolmentId',attendance:'attendanceId',practice:'practiceId',homework:'homeworkId',submissions:'submissionId',rsvps:'rsvpId',registrations:'registrationId',notifications:'notificationId',counters:'counterId',classes:'classId',sessions:'sessionId',events:'eventId',venues:'venueId',institutions:'institutionId',audit:'auditId'};

/** Small DynamoDB DocumentClient double: production Repository and HTTP routes stay real. */
function memoryDocumentClient(){
  return {async send(command:any){
    commandCount++;
    const name=command?.constructor?.name;
    const input=command?.input??{};
    if(name==='GetCommand'){
      const item=rows.get(`${input.Key?.PK}\u0000${input.Key?.SK}`);
      return {Item:item?structuredClone(item):undefined};
    }
    if(name==='QueryCommand'){
      const names=Object.values(input.ExpressionAttributeNames??{});
      const partitionField=names.find(value=>['PK','GSI1PK','GSI2PK'].includes(String(value))) as string|undefined;
      const value=input.ExpressionAttributeValues?.[':p']??input.ExpressionAttributeValues?.[':pk'];
      let items=[...rows.values()].filter(row=>partitionField&&row[partitionField]===value);
      const prefix=input.ExpressionAttributeValues?.[':s'];
      const sortField=Object.entries(input.ExpressionAttributeNames??{}).find(([,field])=>String(field).endsWith('SK'))?.[1] as string|undefined;
      if(prefix&&sortField)items=items.filter(row=>String(row[sortField]??'').startsWith(String(prefix)));
      return {Items:items.slice(0,input.Limit??100).map(row=>structuredClone(row))};
    }
    if(name==='TransactWriteCommand'){
      for(const entry of input.TransactItems??[]){
        const item=entry.Put?.Item;
        if(item)rows.set(keyOf(item),structuredClone(item));
      }
      return {};
    }
    throw new Error(`Unexpected DynamoDB command in isolated E2E: ${name}`);
  }};
}

/** Canonical-table memory double for the actual final-mode Lambda DELETE route. */
function memoryCanonicalDocumentClient(data:Record<string,Row[]>){
  const table=(name:string)=>name.replace(/^sadhana-dev-/,'')==='audit-records'?'audit':name.replace(/^sadhana-dev-/,'');
  return {async send(command:any){
    const name=command?.constructor?.name,input=command?.input??{},entity=input.TableName?table(input.TableName):'';
    if(entity)data[entity]??=[];
    if(name==='GetCommand')return {Item:data[entity].find(row=>Object.entries(input.Key).every(([k,v])=>row[k]===v))};
    if(name==='ScanCommand')return {Items:data[entity].map(row=>structuredClone(row))};
    if(name==='PutCommand'){
      const key=finalKeys[entity],exists=data[entity].some(row=>row[key]===input.Item[key]);
      if(exists)throw Object.assign(Error('Conditional check failed'),{name:'ConditionalCheckFailedException'});
      data[entity].push(structuredClone(input.Item));return {};
    }
    if(name==='TransactWriteCommand'){
      for(const entry of input.TransactItems??[]){
        const action=entry.Delete||entry.Put;
        if(entry.Delete){const e=table(action.TableName),key=finalKeys[e];const row=(data[e]||[]).find(item=>Object.entries(action.Key).every(([k,v])=>item[k]===v));
          const names=action.ExpressionAttributeNames||{},values=action.ExpressionAttributeValues||{};
          if(!row||(names['#v']&&row.version!==values[':v'])||(names['#state']&&row.state!==values[':pending']))throw Object.assign(Error('Transaction canceled'),{name:'TransactionCanceledException'});
        }
        if(entry.Put){const e=table(action.TableName),key=finalKeys[e];if((data[e]||[]).some(row=>row[key]===action.Item[key]))throw Object.assign(Error('Transaction canceled'),{name:'TransactionCanceledException'});}
      }
      for(const entry of input.TransactItems??[]){
        if(entry.Delete){const action=entry.Delete,e=table(action.TableName),key=finalKeys[e];data[e]=data[e].filter(row=>row[key]!==action.Key[key]);}
        else if(entry.Put){const action=entry.Put,e=table(action.TableName);data[e]??=[];data[e].push(structuredClone(action.Item));}
      }
      return {};
    }
    throw new Error(`Unexpected canonical DynamoDB command in isolated E2E: ${name}`);
  }};
}

const envKeys=[
  'SADHANA_ENTITY_TABLE_SET','SADHANA_DATA_MODE','M95_COMPAT_MODE','M95_CALENDAR_WRITES',
  'M95_SERIES_WRITES','M95_MANAGED_EVENT_WRITES','M95_ONBOARDING_MODE','M91_SRUTI_REVIEW_WRITES',
  'M10_REGISTRATION_M9_READS','M10_CORE_DIRECTORY_SHADOW','M10_CORE_DIRECTORY_ROUTING',
  'M10_CORE_FRONTEND_WRITES','M9_TARGET_REPOSITORY_WRITES','M9_TARGET_REPOSITORY_ENABLED',
  'M9_API_ENABLED','M9_API_WRITES_ENABLED','M9_FINAL_LEARNER_READS','M9_LEARNER_WRITES',
  'M9_HOMEWORK_WRITES','M9_HOMEWORK_MEDIA','M10_TEACHER_PRACTICE_M9','M10_CORE_DIRECTORY_ROUTING',
];
const previousEnv=new Map<string,string|undefined>();
before(()=>{
  for(const key of envKeys){previousEnv.set(key,process.env[key]);delete process.env[key];}
  process.env.SADHANA_ENTITY_TABLE_SET='legacy';
  process.env.M95_COMPAT_MODE='off';
});
after(()=>{
  for(const [key,value] of previousEnv)value===undefined?delete process.env[key]:process.env[key]=value;
});

type Role='raaga-admin'|'sruti-admin'|'raaga-teacher'|'super-admin'|'learner';
const roleHeaders:Record<Role,Record<string,string
> >={
  'raaga-admin':{'x-e2e-sub':'e2e-raaga-admin','x-e2e-groups':'raagasudha-admin'},
  'sruti-admin':{'x-e2e-sub':'e2e-sruti-admin','x-e2e-groups':'sruti-admin'},
  'raaga-teacher':{'x-e2e-sub':'e2e-raaga-teacher','x-e2e-groups':'raagasudha-viewer'},
  'super-admin':{'x-e2e-sub':'e2e-super-admin','x-e2e-groups':'sadhana-super-admin'},
  learner:{'x-e2e-sub':'e2e-learner','x-e2e-groups':''},
};

async function startApi(options:{cascadeServiceFactory?:()=>ReturnType<typeof makeFinalCascadeDeletionService>}={}){
  rows.clear();commandCount=0;
  const repository=new SadhanaRepository({tableName:'sadhana-api-e2e-memory',client:memoryDocumentClient() as any});
  const handler=createHandler(repository,options);
  const server=createServer(async(req:IncomingMessage,res:ServerResponse)=>{
    try{
      const url=new URL(req.url??'/','http://127.0.0.1');
      const subject=String(req.headers['x-e2e-sub']??'');
      const groups=String(req.headers['x-e2e-groups']??'').split(',').filter(Boolean);
      const claims=subject?{sub:subject,'cognito:groups':groups}:undefined;
      const chunks:Buffer[]=[];
      for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=Buffer.concat(chunks).toString('utf8');
      const event={
        rawPath:url.pathname,
        requestContext:{stage:'dev',http:{method:req.method??'GET'},...(claims?{authorizer:{jwt:{claims}}}:{})},
        queryStringParameters:Object.fromEntries(url.searchParams),
        ...(body?{body}:{}),
      };
      const response=await handler(event);
      res.writeHead(response.statusCode,response.headers);
      res.end(response.body);
    }catch(error){
      res.writeHead(500,{'content-type':'application/json'});
      res.end(JSON.stringify({error:error instanceof Error?error.message:'Local test server error'}));
    }
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;
  return {
    async request(method:string,path:string,role?:Role,body?:unknown){
      const headers:Record<string,string>={...(role?roleHeaders[role]:{})};
      if(body!==undefined)headers['content-type']='application/json';
      const response=await fetch(`${base}/dev/api${path}`,{
        method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      const text=await response.text();
      return {status:response.status,body:text?JSON.parse(text):null};
    },
    close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())),
  };
}

test('HTTP API creates, reads, updates and audits family and student records with academy isolation',async()=>{
  const api=await startApi();
  try{
    const createdFamily=await api.request('POST','/families?institution=raaga','raaga-admin',{
      parentName:'E2E Guardian',phone:'+447700900111',createdIn:'raaga',
    });
    assert.equal(createdFamily.status,201);
    assert.equal(createdFamily.body.record.parentName,'E2E Guardian');
    assert.equal(createdFamily.body.record.version,1);

    const createdStudent=await api.request('POST','/students?institution=raaga','raaga-admin',{
      name:'E2E Learner',createdIn:'raaga',registrationType:'family',familyId:createdFamily.body.record.id,
    });
    assert.equal(createdStudent.status,201);
    assert.equal(createdStudent.body.record.familyId,createdFamily.body.record.id);

    const updated=await api.request('PATCH',`/families/${createdFamily.body.record.id}?institution=raaga`,'raaga-admin',{
      parentName:'E2E Guardian Updated',phone:'+447700900112',createdIn:'raaga',expectedVersion:1,
    });
    assert.equal(updated.status,200);
    assert.equal(updated.body.record.version,2);

    const raagaStudents=await api.request('GET','/students?institution=raaga','raaga-admin');
    const srutiStudents=await api.request('GET','/students?institution=sruti','sruti-admin');
    assert.equal(raagaStudents.status,200);
    assert.equal(raagaStudents.body.records.length,1);
    assert.equal(srutiStudents.status,200);
    assert.deepEqual(srutiStudents.body.records,[]);

    const audit=await api.request('GET','/audit?institution=raaga','raaga-admin');
    assert.equal(audit.status,200);
    assert.deepEqual(audit.body.records.map((event:Row)=>event.type).sort(),['CREATE','CREATE','UPDATE']);
    assert.ok(audit.body.records.every((event:Row)=>event.actorSub==='e2e-raaga-admin'));
  }finally{await api.close();}
});

test('HTTP API enforces authentication, role permissions and academy boundaries',async()=>{
  const api=await startApi();
  try{
    const unauthenticated=await api.request('GET','/families?institution=raaga');
    assert.equal(unauthenticated.status,401);

    const teacherClassRead=await api.request('GET','/classes?institution=raaga','raaga-teacher');
    assert.equal(teacherClassRead.status,200);
    assert.deepEqual(teacherClassRead.body.records,[]);

    const teacherFamilyRead=await api.request('GET','/families?institution=raaga','raaga-teacher');
    assert.equal(teacherFamilyRead.status,403);
    const learnerDirectoryRead=await api.request('GET','/students?institution=raaga','learner');
    assert.equal(learnerDirectoryRead.status,403);

    const commandsBeforeCrossAcademy=commandCount;
    const crossAcademyRead=await api.request('GET','/families?institution=raaga','sruti-admin');
    assert.equal(crossAcademyRead.status,403);
    assert.equal(commandCount,commandsBeforeCrossAcademy,'authorization must reject before storage access');
  }finally{await api.close();}
});

test('HTTP API validates writes and keeps physical DELETE disabled',async()=>{
  const api=await startApi();
  try{
    const invalid=await api.request('POST','/families?institution=raaga','raaga-admin',{
      parentName:'Invalid Guardian',phone:'not-a-phone',createdIn:'raaga',
    });
    assert.equal(invalid.status,400);
    assert.match(invalid.body.error,/valid international phone number/);
    assert.equal(rows.size,0);

    const extraField=await api.request('POST','/families?institution=raaga','raaga-admin',{
      parentName:'E2E Guardian',phone:'+447700900111',createdIn:'raaga',unexpected:'blocked',
    });
    assert.equal(extraField.status,400);

    const deleted=await api.request('DELETE','/families/FAMILY-E2E-1?institution=raaga','raaga-admin');
    assert.equal(deleted.status,405);
    assert.match(deleted.body.error,/Physical deletion/);

    const stageHealth=await api.request('GET','/health?institution=raaga','raaga-admin');
    assert.equal(stageHealth.status,200);
    assert.equal(stageHealth.body.status,'ok');
  }finally{await api.close();}
});

test('final-mode family DELETE reaches the canonical cascade and permanently retains roll reservations',async()=>{
  const envKeysForTest=['SADHANA_ENTITY_TABLE_SET','SADHANA_ENTITY_FINAL_ACK','SADHANA_DATA_MODE','SADHANA_ENTITY_STAGE'];
  const old=new Map(envKeysForTest.map(key=>[key,process.env[key]]));
  process.env.SADHANA_ENTITY_TABLE_SET='final';
  process.env.SADHANA_ENTITY_FINAL_ACK='enabled';
  process.env.SADHANA_DATA_MODE='final';
  process.env.SADHANA_ENTITY_STAGE='dev';
  const data:Record<string,Row[]>={
    families:[{familyId:'FAMILY-FINAL-E2E',version:1,status:'active',institutionIds:['sruti']}],
    people:[{personId:'PERSON-FINAL-E2E',version:1,status:'active',institutionIds:['sruti'],personTypes:['student'],familyId:'FAMILY-FINAL-E2E',studentProfile:{rollNumbers:{sruti:'SR-900'}}}],
    counters:[{counterId:'ROLL_GLOBAL#SR-900',sequenceType:'ROLL_UNIQUE',institutionId:'sruti',personId:'PERSON-FINAL-E2E'}],
  };
  const canonicalDb=memoryCanonicalDocumentClient(data);
  const api=await startApi({cascadeServiceFactory:()=>makeFinalCascadeDeletionService({db:canonicalDb as any,allowExecute:true})});
  try{
    const result=await api.request('DELETE','/operations/family/FAMILY-FINAL-E2E?institution=sruti','super-admin',{confirm:'DELETE',expectedVersion:1});
    assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.deleted,true);
    assert.equal(result.body.studentsDeleted,1);
    assert.deepEqual(data.families,[]);
    assert.deepEqual(data.people,[]);
    assert.deepEqual(data.counters.map(row=>row.counterId),['ROLL_GLOBAL#SR-900']);
    assert.equal(data.audit.length,1);
    assert.equal(data.audit[0].action,'SUPER_ADMIN_CASCADE_DELETE');
  }finally{
    await api.close();
    for(const [key,value] of old)value===undefined?delete process.env[key]:process.env[key]=value;
  }
});

test('HTTP API fixes health and legacy calendar contracts across configured modes',async()=>{
  const initialMode=process.env.SADHANA_ENTITY_TABLE_SET;
  const api=await startApi();
  try{
    const health=await api.request('GET','/health?institution=raaga','raaga-admin');
    assert.equal(health.status,200);
    assert.deepEqual(health.body,{status:'ok',database:'configured',environment:'protected-api'});

    const deniedCalendarRead=await api.request('GET','/calendar/middlesbrough?institution=raaga','raaga-teacher');
    assert.equal(deniedCalendarRead.status,403);
    assert.match(deniedCalendarRead.body.error,/Raagasudha administrator/);

    const retiredSync=await api.request('POST','/calendar/middlesbrough/sync?institution=raaga','raaga-admin',{});
    assert.equal(retiredSync.status,410);
    assert.match(retiredSync.body.error,/sync has been retired/);
  }finally{await api.close();}

  try{
    process.env.SADHANA_ENTITY_TABLE_SET='final';
    const finalApi=await startApi();
    try{
      const health=await finalApi.request('GET','/health?institution=raaga','raaga-admin');
      assert.equal(health.status,200);
      assert.deepEqual(health.body,{status:'ok',database:'configured',environment:'final-tables'});

      for(const [method,path,body] of [
        ['GET','/calendar/middlesbrough?institution=raaga',undefined],
        ['POST','/calendar/middlesbrough/sync?institution=raaga',{}],
        ['POST','/teachers?institution=raaga',{}],
      ] as const){
        const response=await finalApi.request(method,path,'raaga-admin',body);
        assert.equal(response.status,503,path);
        assert.match(response.body.error,/not migrated|unsupported route|canonical tables not acknowledged/i,path);
      }
    }finally{await finalApi.close();}
  }finally{
    initialMode===undefined?delete process.env.SADHANA_ENTITY_TABLE_SET:process.env.SADHANA_ENTITY_TABLE_SET=initialMode;
  }
});
