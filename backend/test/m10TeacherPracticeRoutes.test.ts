import test from 'node:test';
import assert from 'node:assert/strict';
import {makeM10TeacherPracticeRoutes,validateM9TeacherComment} from '../src/routes/m10TeacherPracticeRoutes.ts';
import {m9CutoverFence} from '../src/m9CutoverFence.mjs';

const claims={sub:'teacher-sub'};
const base={parts:['teacher-practice','PRACTICE-raaga-S-CLASS-2026-11-04','comments'],method:'GET',inst:'raaga' as const,claims,event:{},query:{institution:'raaga'},groups:[]};
const mock={send:async(command:any)=>{
 const x=command.input;
 if(x.TableName?.endsWith('-practice'))return {Item:{practiceId:base.parts[1],institutionId:'raaga',classId:'CLASS-RAAGA',version:1,teacherComments:[{id:'COMMENT-a',comment:'Good',createdAt:'today'}]}};
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
test('different institution denied before returning comments',async()=>withFlag(async()=>{
 const r=makeM10TeacherPracticeRoutes(mock);
 await assert.rejects(()=>r({...base,inst:'sruti',query:{institution:'sruti'}} as any),{status:404});
}));
test('flag off bypasses new handler',async()=>{
 const old=process.env.M10_TEACHER_PRACTICE_M9;delete process.env.M10_TEACHER_PRACTICE_M9;
 try{assert.equal(await makeM10TeacherPracticeRoutes(mock)(base as any),undefined)}finally{if(old!==undefined)process.env.M10_TEACHER_PRACTICE_M9=old}
});
