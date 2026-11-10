import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10TeacherPracticeRoutes,validateM9TeacherComment} from '../routes/teacherPracticeRoutes.ts';
import {m9CutoverFence} from '../cutoverFence.mjs';

const claims={sub:'teacher-sub'};
const base={parts:['teacher-practice','PRACTICE-raaga-S-CLASS-2026-11-04','comments'],method:'GET',inst:'raaga' as const,claims,event:{},query:{institution:'raaga'},groups:[]};
const mock={send:async(command:any)=>{
 const x=command.input;
 if(x.TableName?.endsWith('-submissions')&&x.IndexName==='StudentSubmissionsIndex')return {Items:[
  {recordType:'learner-media',mediaStatus:'ready',purpose:'practice',practiceId:base.parts[1],institutionId:'raaga',studentId:'PERSON-S',submissionId:'LEARNERMEDIA-1',mime:'audio/mpeg',objectKey:'homework-private/learner/raaga/PERSON-S/LEARNERMEDIA-1.mp3',createdAt:'2026-11-08T10:00:00Z'},
  {recordType:'learner-media',mediaStatus:'ready',purpose:'practice',practiceId:base.parts[1],institutionId:'sruti',studentId:'PERSON-S',submissionId:'LEARNERMEDIA-2',mime:'audio/mpeg',objectKey:'homework-private/learner/sruti/PERSON-S/LEARNERMEDIA-2.mp3'},
  {recordType:'learner-media',mediaStatus:'ready',purpose:'profile',practiceId:base.parts[1],institutionId:'raaga',studentId:'PERSON-S',submissionId:'LEARNERMEDIA-3',mime:'audio/mpeg',objectKey:'homework-private/learner/raaga/PERSON-S/LEARNERMEDIA-3.mp3'},
 ]};
 if(x.TableName?.endsWith('-practice'))return {Item:{practiceId:base.parts[1],institutionId:'raaga',studentId:'PERSON-S',classId:'CLASS-RAAGA',version:1,teacherComments:[{id:'COMMENT-a',comment:'Good',createdAt:'today'}]}};
 if(x.TableName?.endsWith('-classes'))return {Item:{classId:'CLASS-RAAGA',institutionId:'raaga',status:'active',teacherPersonIds:['PERSON-T']}};
 if(x.TableName?.endsWith('-people') && x.IndexName)return {Items:[{personId:'PERSON-T',cognitoSub:'teacher-sub',status:'active',personTypes:['teacher'],institutionIds:['raaga']}]};
 if(x.TableName?.endsWith('-people'))return {Item:{personId:'PERSON-T',cognitoSub:'teacher-sub',status:'active',personTypes:['teacher'],institutionIds:['raaga']}};
 throw Error('Unexpected DynamoDB command');
}};
const withFlag=async(fn:()=>Promise<void>)=>{const old=process.env.M10_TEACHER_PRACTICE_M9;process.env.M10_TEACHER_PRACTICE_M9='enabled';try{await fn()}finally{if(old===undefined)delete process.env.M10_TEACHER_PRACTICE_M9;else process.env.M10_TEACHER_PRACTICE_M9=old;}};
test('strict fence allows only migrated practice-comment route when opted in',()=>{
 assert.equal(m9CutoverFence(base.parts,'GET',{strict:true,teacherPractice:true}),null);
 assert.equal(m9CutoverFence(base.parts,'POST',{strict:true,teacherPractice:false})?.status,503);
 assert.equal(m9CutoverFence(['teacher-practice',base.parts[1],'other'],'GET',{strict:true,teacherPractice:true})?.status,503);
});
test('comment validation rejects empty and extra fields',()=>{
 assert.equal(validateM9TeacherComment({comment:'  well done  '}),'well done');
 assert.throws(()=>validateM9TeacherComment({comment:'',role:'admin'}));
});
test('verified assigned teacher can GET comments',async()=>withFlag(async()=>{
 const r=await makeM10TeacherPracticeRoutes(mock)(base as any);
 assert.equal(r?.statusCode,200);
 assert.equal(JSON.parse(r!.body).records[0].comment,'Good');
}));
test('assigned teacher can get only ready audio linked to this practice entry',async()=>withFlag(async()=>{
 const oldBucket=process.env.SADHANA_LEARNER_MEDIA_BUCKET;process.env.SADHANA_LEARNER_MEDIA_BUCKET='private-media';
 try{
  const signed:string[]=[];
  const route=makeM10TeacherPracticeRoutes(mock,{signGet:async(bucket,key,mime)=>(signed.push(`${bucket}|${key}|${mime}`),`signed:${key}`)});
  const response=await route({...base,parts:['teacher-practice',base.parts[1],'media']} as any);
  assert.equal(response?.statusCode,200);
  assert.deepEqual(JSON.parse(response!.body).records,[{id:'LEARNERMEDIA-1',mime:'audio/mpeg',createdAt:'2026-11-08T10:00:00Z',url:'signed:homework-private/learner/raaga/PERSON-S/LEARNERMEDIA-1.mp3'}]);
  assert.deepEqual(signed,['private-media|homework-private/learner/raaga/PERSON-S/LEARNERMEDIA-1.mp3|audio/mpeg']);
 }finally{if(oldBucket===undefined)delete process.env.SADHANA_LEARNER_MEDIA_BUCKET;else process.env.SADHANA_LEARNER_MEDIA_BUCKET=oldBucket;}
}));
test('different institution denied before returning comments',async()=>withFlag(async()=>{
 const r=makeM10TeacherPracticeRoutes(mock);
 await assert.rejects(()=>r({...base,inst:'sruti',query:{institution:'sruti'}} as any),{status:404});
}));
test('flag off bypasses new handler',async()=>{
 const old=process.env.M10_TEACHER_PRACTICE_M9;delete process.env.M10_TEACHER_PRACTICE_M9;
 try{assert.equal(await makeM10TeacherPracticeRoutes(mock)(base as any),undefined)}finally{if(old!==undefined)process.env.M10_TEACHER_PRACTICE_M9=old}
});
