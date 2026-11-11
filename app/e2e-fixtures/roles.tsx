/** Test-only role fixture. It renders the real application with an in-memory API. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import type {CloudSession} from '../src/CloudAuth';
import type {SadhanaApiClient} from '../src/api/sadhanaClient';
import '../src/styles.css';

const requestedRole = new URLSearchParams(location.search).get('role') || 'admin';
const role = ['admin', 'teacher', 'student', 'guardian'].includes(requestedRole) ? requestedRole : 'admin';
const linked = role === 'guardian'
  ? [{id:'E2E-CHILD-1',name:'Fixture Child One',rollNumber:'E2E-001',kind:'guardian',relationship:'parent' as const},{id:'E2E-CHILD-2',name:'Fixture Child Two',rollNumber:'E2E-002',kind:'guardian',relationship:'parent' as const}]
  : role === 'student'
    ? [{id:'E2E-STUDENT-1',name:'Fixture Student',rollNumber:'E2E-101',kind:'student',relationship:'self' as const}]
    : [];
const empty={records:[],more:false,source:'fixture'};
// Local-only curriculum examples let staff, teacher and learner previews show the shared journey UI.
const fixtureSyllabus=[
  {id:'RESOURCE-FIXTURE-PRAVESA',title:'Praveśa — Entry',description:'Sanskrit alphabet and introductory chants, with attention to clear sounds and pronunciation.',category:'syllabus',audience:'all',url:'',classIds:[],programme:'Śruti Children',stage:'Praveśa',levelNumber:0,studentMessage:'I discover Śruti.',objective:'Build confidence with Sanskrit sounds and learning by listening and repeating.',duration:'3–6 months',fileName:'',mimeType:'',fileSize:0,hasFile:false,versionLabel:'2026–27',status:'published',createdAt:'2026-11-10T09:00:00.000Z',updatedAt:'2026-11-10T09:00:00.000Z',version:1,canManage:role==='admin'},
  {id:'RESOURCE-FIXTURE-ARAMBHA',title:'Ārambha — Beginning',description:'Foundational practice in listening, repetition and correct pronunciation.',category:'syllabus',audience:'all',url:'',classIds:[],programme:'Śruti Children',stage:'Ārambha',levelNumber:1,studentMessage:'I begin to learn correctly.',objective:'Establish a steady foundation for chanting.',duration:'6–12 months',fileName:'',mimeType:'',fileSize:0,hasFile:false,versionLabel:'2026–27',status:'published',createdAt:'2026-11-10T09:00:00.000Z',updatedAt:'2026-11-10T09:00:00.000Z',version:1,canManage:role==='admin'},
  {id:'RESOURCE-FIXTURE-ABHYASA',title:'Abhyāsa — Practice and learn more',description:'Build fluency through regular guided practice.',category:'syllabus',audience:'all',url:'',classIds:[],programme:'Śruti Children',stage:'Abhyāsa',levelNumber:2,studentMessage:'I practise until it becomes mine.',objective:'Grow accuracy and confidence through repetition.',duration:'12–24 months',fileName:'',mimeType:'',fileSize:0,hasFile:false,versionLabel:'2026–27',status:'draft',createdAt:'2026-11-10T09:00:00.000Z',updatedAt:'2026-11-10T09:00:00.000Z',version:1,canManage:role==='admin'},
  {id:'RESOURCE-FIXTURE-SADHANA',title:'Sādhana — Disciplined practice',description:'Deepen chanting through structured, sustained study.',category:'syllabus',audience:'all',url:'',classIds:[],programme:'Śruti Children',stage:'Sādhana',levelNumber:25,studentMessage:'I deepen my learning.',objective:'Develop consistency and understanding across the curriculum.',duration:'24–36 months',fileName:'',mimeType:'',fileSize:0,hasFile:false,versionLabel:'2026–27',status:'published',createdAt:'2026-11-10T09:00:00.000Z',updatedAt:'2026-11-10T09:00:00.000Z',version:1,canManage:role==='admin'},
];
const dashboard=(id:string)=>({student:{id,name:role==='guardian'?'Fixture Child One':'Fixture Student',rollNumber:'E2E-101'},classes:[],nextSessions:[],calendarSessions:[],practice:[],attendance:{marks:[],byClass:[],attended:0,counted:0,percent:null}});
const profiles:Record<string,{preferredName:string;phone:string;about:string;version:number}>={
  'E2E-STUDENT-1':{preferredName:'',phone:'',about:'',version:1},
  'E2E-CHILD-1':{preferredName:'',phone:'',about:'',version:1},
  'E2E-CHILD-2':{preferredName:'',phone:'',about:'',version:1},
};
const learnerMedia:Record<string,Array<{id:string;purpose:string;mime:string;url:string;createdAt:string}>>={};
const writes:Array<{kind:string;id?:string;value:unknown}>=[];
let parentAccessStatus='NOT_INVITED';
let registration:any={
  registrationId:'RS-2026-E2E-SHARED-EMAIL',submittedAt:'2026-11-08T09:00:00.000Z',reviewStatus:'approved',registrationType:'New family',preferredLocationId:'Carlisle',
  primaryContactPersonId:'PARENT-E2E',
  people:[{personId:'PARENT-E2E',fullName:'Fixture Parent',email:'shared-parent@example.test',phone:'+447700900000',address:{city:'Carlisle',country:'United Kingdom'}},
    {personId:'CHILD-E2E-1',fullName:'Fixture Child One',dateOfBirth:'2016-02-01'},
    {personId:'CHILD-E2E-2',fullName:'Fixture Child Two',dateOfBirth:'2018-04-03'}],
  students:[{personId:'CHILD-E2E-1',studentType:'Child',preferredLocationId:'Carlisle',classEnrolmentRequested:true,preferredClassId:'E2E-CLASS'},
    {personId:'CHILD-E2E-2',studentType:'Child',preferredLocationId:'Carlisle',classEnrolmentRequested:true,preferredClassId:'E2E-CLASS'}],
  relationships:[{guardianPersonId:'PARENT-E2E',studentPersonId:'CHILD-E2E-1',verificationStatus:'verified'},{guardianPersonId:'PARENT-E2E',studentPersonId:'CHILD-E2E-2',verificationStatus:'verified'}],
};
const registrationCalls:Array<{kind:string;value:unknown}>=[];
const myProfile={name:role==='guardian'?'Fixture Guardian':'Fixture Student',givenName:'Fixture',familyName:role==='guardian'?'Guardian':'Student',email:`${role}@example.test`,emailVerified:true,phone:'+447700900000',phoneVerified:true};
let pendingPhone='';
const apiHandlers:Record<string,(...args:any[])=>any>={
  getMyProfile:async()=>({...myProfile}),
  updateMyProfile:async(data:{name:string;givenName:string;familyName:string})=>{Object.assign(myProfile,data);writes.push({kind:'account-profile',value:{...data}});return {...myProfile};},
  uploadMyPhoto:async()=>({photoUrl:'data:image/png;base64,fixture',updated:true}),
  myLinkedStudents:async(institution:string)=>({records:institution==='sruti'?linked:[]}),
  learnerDashboard:async(_institution:string,id:string)=>dashboard(id),
  learnerHomework:async()=>empty,
  learnerExtras:async(_institution:string,id:string)=>({student:{id,name:id==='E2E-CHILD-1'?'Fixture Child One':id==='E2E-CHILD-2'?'Fixture Child Two':'Fixture Student',rollNumber:id==='E2E-STUDENT-1'?'E2E-101':id==='E2E-CHILD-1'?'E2E-001':'E2E-002'},profile:{...(profiles[id]||{preferredName:'',phone:'',about:'',version:1})},teachers:[],venues:[],classes:[]}),
  saveLearnerProfile:async(_institution:string,id:string,data:{preferredName:string;phone:string;about:string;expectedVersion:number})=>{
    const current=profiles[id]||{preferredName:'',phone:'',about:'',version:1};
    if(current.version!==data.expectedVersion)throw Error('Profile changed. Refresh and try again.');
    profiles[id]={preferredName:data.preferredName.trim(),phone:data.phone,about:data.about,version:current.version+1};
    writes.push({kind:'learner-profile',id,value:{...profiles[id]}});
    return {updated:true,version:profiles[id].version};
  },
  listLearnerMedia:async(_institution:string,id:string)=>({records:[...(learnerMedia[id]||[])]}),
  beginLearnerMedia:async(_institution:string,id:string,data:{mime:string;size:number;purpose:string})=>({uploadUrl:`/__e2e_upload/${id}`,key:`e2e/${id}/${data.purpose}`,expiresIn:300,maxBytes:5_000_000}),
  finishLearnerMedia:async(_institution:string,id:string,key:string,purpose:string)=>{
    const record={id:`MEDIA-${id}-${learnerMedia[id]?.length||0}`,purpose,mime:'image/jpeg',url:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',createdAt:'2026-11-09T12:00:00.000Z'};
    learnerMedia[id]=[...(learnerMedia[id]||[]),record];writes.push({kind:'learner-media',id,value:{key,purpose}});return {uploaded:true,id:record.id};
  },
  learnerAcademyDirectory:async()=>({institution:'sruti',administrators:[],teachers:[],venues:[]}),
  listSchedule:async()=>empty,
  listTeachers:async()=>empty,
  listAdministrators:async()=>({records:[],canManage:role==='admin'}),
  listManagedEvents:async()=>empty,
  listTeacherLinks:async()=>({institution:'sruti',teachers:[],rows:[],more:false}),
  listLearningResources:async(_institution:string,studentId?:string)=>({records:fixtureSyllabus.filter(record=>!studentId||record.status==='published'),stages:fixtureSyllabus.map(record=>({programme:record.programme,stage:record.stage,levelNumber:record.levelNumber,published:record.status==='published'})),more:false,source:'fixture'}),
  listLearningResourceClasses:async()=>({records:[]}),
  listWebsiteRegistrations:async(filter?:{status?:string})=>({records:filter?.status==='approved'?[structuredClone(registration)]:[]}),
  getWebsiteRegistration:async()=>({registration:structuredClone(registration)}),
  importWebsiteRegistration:async(_id:string,body:{preview?:boolean;confirmReference?:string})=>{
    registrationCalls.push({kind:body.preview?'preview-import':'execute-import',value:structuredClone(body)});
    if(body.preview)return {preview:true,readyToExecute:true};
    if(body.confirmReference!=='RS-2026-E2E-SHARED-EMAIL')throw Error('Fixture registration reference mismatch');
    registration={...registration,sadhanaImport:{status:'imported'}};
    return {imported:true,registrationId:registration.registrationId,familyId:'RAAGA-FAMILY-E2E',studentRollNumbers:{'CHILD-E2E-1':'RS-201','CHILD-E2E-2':'RS-202'}};
  },
  getParentAccessStatus:async()=>({registrationId:registration.registrationId,imported:registration.sadhanaImport?.status==='imported',status:parentAccessStatus,updatedAt:null}),
  linkExistingParentAccount:async()=>{parentAccessStatus='ACTIVE';registrationCalls.push({kind:'link-existing-parent',value:registration.registrationId});return {message:'The existing parent login is linked to this Ragasudha family.'};},
};
const api=new Proxy(apiHandlers,{get(target,key){
  if(typeof key==='symbol'||key==='then')return undefined;
  if(Object.prototype.hasOwnProperty.call(target,key))return target[key as string];
  // Unused reads resolve to empty collections so page rendering remains isolated.
  return async()=>empty;
}}) as unknown as SadhanaApiClient;
const staff:CloudSession['staff']=role==='admin'
  ? {subject:'e2e-admin',role:'admin',displayName:'Fixture Administrator',institutions:['raaga','sruti'],adminInstitutions:['raaga','sruti'],teacherInstitutions:['raaga','sruti']}
  : role==='teacher'
    ? {subject:'e2e-teacher',role:'viewer',displayName:'Fixture Teacher',institutions:['sruti'],teacherInstitutions:['sruti']}
    : {subject:`e2e-${role}`,role:'learner',displayName:role==='guardian'?'Fixture Guardian':'Fixture Student',institutions:['sruti']};
const cloud:CloudSession={staff,api,signOut:async()=>{},beginPhoneChange:async(phone)=>{pendingPhone=phone;writes.push({kind:'phone-code-request',value:phone});},verifyPhoneChange:async(code)=>{if(code!=='123456')throw Error('The verification code is incorrect.');myProfile.phone=pendingPhone;myProfile.phoneVerified=true;writes.push({kind:'phone-verified',value:pendingPhone});}};
Object.defineProperty(window,'__sadhanaProfileE2E',{value:{snapshot:()=>structuredClone({profile:myProfile,learnerProfiles:profiles,learnerMedia,writes})}});
Object.defineProperty(window,'__sadhanaRegistrationE2E',{value:{calls:()=>structuredClone(registrationCalls),snapshot:()=>structuredClone({registration,parentAccessStatus})}});
sessionStorage.setItem('sadhana:v095:workspace','sruti');
sessionStorage.setItem('sadhana:v095:page','Dashboard');
sessionStorage.removeItem('sadhana:view-as');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App cloud={cloud}/></React.StrictMode>);
