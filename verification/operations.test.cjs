/* Dependency-free mocked DynamoDB tests for Sadhana v0.9 operations API. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const store = new Map();
const calls=[];
const key = (k) => `${k.PK}|${k.SK}`;
const put=(v)=>store.set(key(v),structuredClone(v));
const fakeDb={send:async cmd=>{
 const q=cmd.input;calls.push({kind:cmd.kind,input:q});
 if(cmd.kind==='Get')return {Item:store.get(key(q.Key))};
 if(cmd.kind==='Query')return {Items:[...store.values()].filter(v=>v.PK===q.ExpressionAttributeValues[':pk'])};
 if(cmd.kind==='TransactWrite'){
  for(const it of q.TransactItems){const op=it.ConditionCheck||it.Put;const prior=store.get(key(op.Key||op.Item));if(it.ConditionCheck){if(!prior||prior.recordType!=='class'||prior.version!==op.ExpressionAttributeValues[':version']){const e=Error('condition');e.name='TransactionCanceledException';throw e;}}
   else if(op.ConditionExpression?.includes('attribute_not_exists')&&prior){const e=Error('exists');e.name='TransactionCanceledException';throw e;}
   else if(op.ExpressionAttributeValues?.[':v']!==undefined&&prior?.version!==op.ExpressionAttributeValues[':v']){const e=Error('version');e.name='TransactionCanceledException';throw e;}}
  for(const it of q.TransactItems){if(it.Put)put(it.Put.Item);}return {};
 }
 throw Error('unknown command '+cmd.kind);
}};
class Cmd {constructor(input){this.input=input;this.kind=this.constructor.name.replace('Command','');}}
class GetCommand extends Cmd{};class QueryCommand extends Cmd{};class PutCommand extends Cmd{};class TransactWriteCommand extends Cmd{};
const modules={
 '@aws-sdk/client-dynamodb':{DynamoDBClient:class{}},
 '@aws-sdk/lib-dynamodb':{DynamoDBDocumentClient:{from:()=>fakeDb},GetCommand,QueryCommand,PutCommand,TransactWriteCommand},
 './scheduleModel.ts':{schedulePK:inst=>`SCHEDULE#${inst}`,scheduleSK:id=>`RECORD#${id}`},
};
const originalRequire=Module.prototype.require;
const compile=(p)=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function loadSource(p){const m=new Module(p,module);m.filename=p;m.paths=module.paths;m._compile(compile(p),p);return m.exports;}
let model;
Module.prototype.require=function(id){if(id in modules)return modules[id];if(id==='./model.ts')return model;return originalRequire.call(this,id);};
try{model=loadSource(__dirname+'/../backend/src/model.ts');}finally{}
const {operations}=loadSource(__dirname+'/../backend/src/academyOperations.ts');
Module.prototype.require=originalRequire;
process.env.SADHANA_TABLE_NAME='mock-test-only';
const admin={sub:'admin', 'cognito:groups':['sruti-admin']};
const teacher={sub:'t1','cognito:groups':['sruti-viewer']};
const other={sub:'t2','cognito:groups':['sruti-viewer']};
const outsider={sub:'outside','cognito:groups':[]};
const master=(id,teacherId='T1')=>put({PK:'SCHEDULE#sruti',SK:`RECORD#${id}`,id,recordType:'class',version:1,teacherId,lifecycleStatus:'active'});
const dated=(id,classId='C1')=>put({PK:'SCHEDULE#sruti',SK:`RECORD#${id}`,id,recordType:'class-session',classId,date:'2026-10-19',version:1});
const status=async(p,expected)=>{let error;try{await p;}catch(e){error=e;}assert.ok(error,`expected ${expected} rejection`);assert.equal(error.status,expected,`expected ${expected}, got ${error.message}`);};
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
const create=(kind,body,as=admin)=>operations('sruti',kind,'POST',as,body);
const list=(kind,as=admin)=>operations('sruti',kind,'GET',as);
let fid,sid,eid,aid,prid;
test('Reject anonymous operational listing',async()=>status(list('student',outsider),403));
test('Reject cross-academy admin listing',async()=>status(operations('raaga','family','GET',admin),403));
test('Reject teacher family listing',async()=>status(list('family',teacher),403));
test('Reject teacher family/student/enrolment edits',async()=>{for(const kind of ['family','student','enrolment'])await status(create(kind,{},teacher),403)});
test('Reject missing parent details',async()=>status(create('family',{parentName:'P',phone:'invalid'}),400));
test('Create valid family and student',async()=>{fid=(await create('family',{parentName:'Parent',phone:'+447700900123'})).record.id;sid=(await create('student',{name:'Student',familyId:fid})).record.id;assert.ok(fid&&sid);});
test('Reject invalid family reference',async()=>status(create('student',{name:'Student',familyId:'wrong'}),404));
test('Reject minor without linked family/adult confirmation',async()=>status(create('student',{name:'Student'}),400));
test('Reject unknown write attributes',async()=>status(create('family',{parentName:'P',phone:'+447700900123',admin:true}),400));
test('Reject enrolment without master',async()=>status(create('enrolment',{studentId:sid,classId:'missing',startDate:'2026-10-01'}),404));
test('Create enrolled student with transaction master condition',async()=>{master('C1');dated('S1');put({PK:'TEACHER_REGISTRY',SK:'TEACHER#T1',active:true,cognitoSub:'t1',institutions:['sruti']});put({PK:'TEACHER_SUB#t1',SK:'LINK',teacherId:'T1'});eid=(await create('enrolment',{studentId:sid,classId:'C1',startDate:'2026-10-01'})).record.id;assert.ok(calls.at(-1).input.TransactItems.some(x=>x.ConditionCheck));});
test('Reject overlapping enrolment',async()=>status(create('enrolment',{studentId:sid,classId:'C1',startDate:'2026-10-02'}),409));
test('Teacher roster returns names only',async()=>{const r=await list('student',teacher);assert.deepEqual(r.records,[{id:sid,name:'Student',institution:'sruti'}]);});
test('Unassigned teacher cannot see roster',async()=>assert.equal((await list('student',other)).records.length,0));
test('Teacher cannot see all academy enrolments',async()=>assert.equal((await list('enrolment',other)).records.length,0));
test('Teacher cannot write another teacher class attendance',async()=>status(create('attendance',{studentId:sid,sessionId:'S1',status:'present'},other),403));
test('Teacher attendance for assigned class',async()=>{aid=(await create('attendance',{studentId:sid,sessionId:'S1',status:'present'},teacher)).record.id;assert.ok(aid);});
test('Reject invalid attendance status',async()=>status(create('attendance',{studentId:sid,sessionId:'S1',status:'banana'},teacher),400));
test('Reject duplicate attendance for session',async()=>status(create('attendance',{studentId:sid,sessionId:'S1',status:'absent'},teacher),409));
test('Reject teacher editing record of other teacher by changing class',async()=>{master('C2','T2');dated('S2','C2');put({PK:'TEACHER_REGISTRY',SK:'TEACHER#T2',active:true,cognitoSub:'t2',institutions:['sruti']});put({PK:'TEACHER_SUB#t2',SK:'LINK',teacherId:'T2'});const a=(await create('attendance',{studentId:sid,sessionId:'S1',status:'absent',note:'old'},admin).catch(()=>null)); await status(operations('sruti','attendance','PATCH',other,{expectedVersion:1,sessionId:'S2',status:'present'},aid),403);});
test('Reject RSVP invalid status',async()=>status(create('rsvp',{studentId:sid,sessionId:'S1',intention:'maybe'},teacher),400));
test('Create RSVP and reject duplicate',async()=>{await create('rsvp',{studentId:sid,sessionId:'S1',intention:'attending'},teacher);await status(create('rsvp',{studentId:sid,sessionId:'S1',intention:'not_attending'},teacher),409);});
test('Reject practice without valid minutes',async()=>status(create('practice',{studentId:sid,classId:'C1',date:'2026-10-19',didPractice:true,minutes:0},teacher),400));
test('Create practice and reject duplicate',async()=>{prid=(await create('practice',{studentId:sid,classId:'C1',date:'2026-10-19',didPractice:true,minutes:20},teacher)).record.id;await status(create('practice',{studentId:sid,classId:'C1',date:'2026-10-19',didPractice:true,minutes:15},teacher),409);});
test('Reject PATCH stale record version',async()=>status(operations('sruti','practice','PATCH',teacher,{expectedVersion:0,minutes:30},prid),409));
test('Reject practice reassignment on PATCH',async()=>status(operations('sruti','practice','PATCH',teacher,{expectedVersion:1,classId:'C2'},prid),400));
test('Reject archived class enrolment',async()=>{const m=store.get('SCHEDULE#sruti|RECORD#C1');m.lifecycleStatus='archived';await status(create('enrolment',{studentId:sid,classId:'C1',startDate:'2026-11-01'}),409);m.lifecycleStatus='active';});
test('Reject invalid calendar date',async()=>status(create('enrolment',{studentId:sid,classId:'C1',startDate:'2026-02-30'}),400));
test('Create teacher feedback',async()=>{const result=await create('feedback',{studentId:sid,classId:'C1',date:'2026-10-19',note:'Good work'},teacher);assert.ok(result.record.id);});
test('Reject unsupported API verb',async()=>status(operations('sruti','practice','DELETE',admin),405));
(async()=>{let passed=0;for(const [name,fn] of tests){try{await fn();console.log('PASS',name);passed++;}catch(e){console.error('FAIL',name,e.stack||e);process.exitCode=1;}}console.log(`RESULT ${passed}/${tests.length} passed`);})();
