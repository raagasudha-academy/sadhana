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
  ? [{id:'E2E-CHILD-1',name:'Fixture Child One',rollNumber:'E2E-001',kind:'student',relationship:'parent' as const},{id:'E2E-CHILD-2',name:'Fixture Child Two',rollNumber:'E2E-002',kind:'student',relationship:'parent' as const}]
  : role === 'student'
    ? [{id:'E2E-STUDENT-1',name:'Fixture Student',rollNumber:'E2E-101',kind:'student',relationship:'child' as const}]
    : [];
const empty={records:[],more:false,source:'fixture'};
const dashboard=(id:string)=>({student:{id,name:role==='guardian'?'Fixture Child One':'Fixture Student',rollNumber:'E2E-101'},classes:[],nextSessions:[],calendarSessions:[],practice:[],attendance:{marks:[],byClass:[],attended:0,counted:0,percent:null}});
const apiHandlers:Record<string,(...args:any[])=>any>={
  getMyProfile:async()=>({name:'Fixture Account',givenName:'Fixture',familyName:'Account',email:'fixture@example.test',emailVerified:true,phone:'+447700900000',phoneVerified:true}),
  myLinkedStudents:async(institution:string)=>({records:institution==='sruti'?linked:[]}),
  learnerDashboard:async(_institution:string,id:string)=>dashboard(id),
  learnerHomework:async()=>empty,
  learnerExtras:async(_institution:string,id:string)=>({student:{id,name:'Fixture Student',rollNumber:'E2E-101'},profile:{preferredName:'',phone:'',about:'',version:1},teachers:[],venues:[],classes:[]}),
  learnerAcademyDirectory:async()=>({institution:'sruti',administrators:[],teachers:[],venues:[]}),
  listSchedule:async()=>empty,
  listTeachers:async()=>empty,
  listAdministrators:async()=>({records:[],canManage:role==='admin'}),
  listManagedEvents:async()=>empty,
  listTeacherLinks:async()=>({institution:'sruti',teachers:[],rows:[],more:false}),
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
const cloud:CloudSession={staff,api,signOut:async()=>{},beginPhoneChange:async()=>{},verifyPhoneChange:async()=>{}};
sessionStorage.setItem('sadhana:v095:workspace','sruti');
sessionStorage.setItem('sadhana:v095:page','Dashboard');
sessionStorage.removeItem('sadhana:view-as');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App cloud={cloud}/></React.StrictMode>);
