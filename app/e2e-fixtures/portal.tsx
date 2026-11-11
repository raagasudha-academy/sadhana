/** Dedicated test-only entry point. Actual App and registration UI, synthetic cloud session.
 * Never import CloudAuth or createSadhanaApi here. No live credentials or AWS calls.
 */
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App';
import type {CloudSession} from '../src/CloudAuth';
import type {SadhanaApiClient} from '../src/api/sadhanaClient';
import '../src/styles.css';

// Synthetic state lives in sessionStorage so a browser reload exercises persistence.
// Each Playwright test gets its own fresh browser context and isolated storage.
const STORAGE_KEY='sadhana:e2e:fixture:v2';
const initialTables:Record<string,any[]>={
 family:[
  {id:'FAMILY-E2E-1',version:1,parentName:'Test Guardian',phone:'+447700900111',location:'Carlisle',archived:false},
  {id:'FAMILY-E2E-2',version:1,parentName:'Test Northern Guardian',phone:'+447700900222',location:'Newcastle',archived:false},
 ],
 student:[
  {id:'STUDENT-E2E-2',version:1,rollNumber:'RS-2',name:'Test Meera',familyId:'FAMILY-E2E-1',location:'Carlisle',archived:false},
  {id:'STUDENT-E2E-10',version:1,rollNumber:'RS-10',name:'Test Arjun',familyId:'FAMILY-E2E-1',location:'Carlisle',archived:true},
  {id:'STUDENT-E2E-3',version:1,rollNumber:'RS-3',name:'Test Nila',familyId:'FAMILY-E2E-2',location:'Newcastle',archived:false},
 ],
 enrolment:[],attendance:[],practice:[],feedback:[],rsvp:[],
 // Retained identity history models the production cascade policy.
 rollReservations:[
  {counterId:'ROLL_GLOBAL#RS-2',sequenceType:'ROLL_UNIQUE',personId:'STUDENT-E2E-2'},
  {counterId:'ROLL_GLOBAL#RS-10',sequenceType:'ROLL_UNIQUE',personId:'STUDENT-E2E-10'},
 ],registrationHistory:[{registrationId:'SR-2026-E2E',familyId:'FAMILY-E2E-1',importStatus:'imported'}],
};
const saved=sessionStorage.getItem(STORAGE_KEY);
const tables:Record<string,any[]>=saved?JSON.parse(saved):structuredClone(initialTables);
const writes:Array<{kind:string,id:string,changes:Record<string,unknown>}>=[];
const cascadeWrites:Array<{kind:string;id:string}> = [];
const commitFixture=()=>sessionStorage.setItem(STORAGE_KEY,JSON.stringify(tables));
commitFixture();
// Expose only synthetic state to assert identity invariants in browser tests.
Object.defineProperty(window,'__sadhanaE2E',{value:{snapshot:()=>structuredClone(tables),writes:()=>structuredClone(writes),cascadeWrites:()=>structuredClone(cascadeWrites)}});
const apiHandlers={
  async listOperations(kind:string){return {records:(tables[kind]||[]).map(record=>({...record}))};},
  async updateOperation(kind:string,_institution:string,id:string,changes:Record<string,unknown>,version:number){
    const row=(tables[kind]||[]).find(x=>x.id===id);
    if(!row||row.version!==version)throw Error('Fixture update version mismatch');
    // Exercise the actual application's archive/restore payload against in-memory records.
    if(Object.keys(changes).some(key=>key!=='archived'))throw Error('Fixture allows archived-only lifecycle writes');
    writes.push({kind,id,changes:{...changes}});
    Object.assign(row,changes,{version:row.version+1});
    commitFixture();
    return {record:{...row}};
  },
  async previewCascadeDelete(_institution:string,target:{type:string;id:string;version:number}){
    const family=target.type==='families';
    const learners=family?tables.student.filter(x=>x.familyId===target.id):tables.student.filter(x=>x.id===target.id);
    const counts=[...(family?[{label:'families',count:1}]:[]),{label:'people',count:learners.length}];
    return {targetType:target.type,targetId:target.id,expectedVersion:target.version,signature:'fixture-signed-preview',counts,total:counts.reduce((sum,row)=>sum+row.count,0),studentCount:learners.length,
      retained:[{label:'Website registrations retained for reconciliation',count:1}],executionEnabled:true,executionBlocked:false,
      notice:'The source website registration is retained; its Sadhana import mapping will be updated to record this removal.'};
  },
  async executeCascadeDelete(_institution:string,target:{type:string;id:string},signature:string){
    if(signature!=='fixture-signed-preview')throw Error('Fixture deletion preview mismatch');
    if(target.type==='families'){
      const learners=tables.student.filter(x=>x.familyId===target.id);
      tables.student=tables.student.filter(x=>x.familyId!==target.id);
      tables.family=tables.family.filter(x=>x.id!==target.id);
      cascadeWrites.push({kind:'family',id:target.id},...learners.map(x=>({kind:'student',id:x.id})));
      // Deliberately retain registration history and ROLL_UNIQUE reservations.
      const history=tables.registrationHistory[0];history.studentIds=[];history.familyDeleted=true;
    } else {
      tables.student=tables.student.filter(x=>x.id!==target.id);
      cascadeWrites.push({kind:'student',id:target.id});
    }
    commitFixture();
    return {deleted:true};
  },
  async listSchedule(){return {records:[],more:false,source:'fixture'};},
  async list(){return {records:[],more:false};},
  async listTeachers(){return {records:[],more:false};},
  async listAdministrators(){return {records:[],canManage:false};},
  async listManagedEvents(){return {records:[]};},
};
const api=new Proxy(apiHandlers,{get(target,key){
  if(typeof key==='symbol'||key==='then')return undefined;
  if(Object.prototype.hasOwnProperty.call(target,key))return (target as any)[key];
  return (..._args:unknown[])=>Promise.reject(Error(`Unmocked portal API method: ${String(key)}`));
}}) as unknown as SadhanaApiClient;
const cloud:CloudSession={staff:{subject:'e2e-staff',role:'admin',isSuperAdmin:true,displayName:'Test Administrator',institutions:['raaga','sruti'],adminInstitutions:['raaga','sruti']},api,signOut:async()=>{}};
// Explicitly select a real app route with synthetic data, without requiring Cognito.
sessionStorage.setItem('sadhana:v095:workspace','raaga');
sessionStorage.setItem('sadhana:v095:page','Families & Students');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App cloud={cloud}/></React.StrictMode>);
