import test from 'node:test';
import assert from 'node:assert/strict';
import {M9_SCHEMA,validateSchema} from '../scripts/schema.mjs';
import {planMigration} from '../scripts/migrationPlannerCore.mjs';
import {previewTransform,transformOne} from '../scripts/transformCore.mjs';
const make=(pk,id,recordType,rest={})=>({PK:pk,SK:`RECORD#${id}`,id,recordType,institution:pk.replace('SCHEDULE#',''),...rest});
const fixture=()=>({calendar:[
 make('SCHEDULE#raaga','CLS-1','class',{name:'Vocal',teacherId:'T1'}),
 make('SCHEDULE#raaga','SSN-1','class-session',{classId:'CLS-1',date:'2026-07-03',startTime:'10:00',endTime:'11:00'}),
 make('SCHEDULE#shared','HOL-1','holiday',{allDay:true,date:'2026-12-25'}),
 make('SCHEDULE#raaga','EV-1','special-event',{name:'Annual event'}),
 {PK:'VENUE#V1',SK:'DETAIL',id:'V1',name:'Venue'},
 {PK:'SCHEDULE_SERIES#raaga',SK:'FROM#1',institution:'raaga',classId:'CLS-1',effectiveFrom:'2026-07-01',changes:{startTime:'10:00'}}
 ],admin:[{PK:'TEACHER_REGISTRY',SK:'TEACHER#T1',id:'T1',displayName:'Teacher',cognitoSub:'S1',institutions:['raaga']},{PK:'TEACHER_SUB#S1',SK:'LINK',teacherId:'T1'}],audit:[{PK:'AUDIT#raaga',SK:'EVENT#1',id:'REPEATED',at:'2026-07-01T10:00:00Z'}],students:[],learning:[]});
test('18 complete, uniquely named tables with valid PK and index keys',()=>{assert.deepEqual(validateSchema(),[]);assert.equal(M9_SCHEMA.length,18);assert.equal(new Set(M9_SCHEMA.map(t=>t.partitionKey)).has('auditId'),true);});
test('pure transformation preview reconciles the fixture after teacher-link merging',()=>{const tables=fixture(),plan=planMigration(tables,{strictBaseline:false}),result=previewTransform(tables,plan);assert.equal(plan.problems.length,0);assert.equal(result.transformFailures,0);assert.equal(result.targetItems,8);assert.equal(result.readyForWrites,false);assert.equal(result.rows.filter(x=>x.tableName==='sadhana-dev-people').length,1);});
test('original payload preserved and DST-aware UTC conversion used',()=>{const tables=fixture(),plan=planMigration(tables,{strictBaseline:false});const out=previewTransform(tables,plan);const session=out.rows.find(x=>x.item.sessionId==='SSN-1').item;assert.equal(session.startAt,'2026-07-03T09:00:00.000Z');assert.equal(session.localStartTime,'10:00');assert.equal(session.timezone,'Europe/London');assert.deepEqual(session.legacyPayload,tables.calendar[1]);});
test('historical audit identity generated from PK/SK and original audit payload retained',()=>{const tables=fixture(),plan=planMigration(tables,{strictBaseline:false}),out=previewTransform(tables,plan);const audit=out.rows.find(x=>x.tableName==='sadhana-dev-audit').item;assert.match(audit.auditId,/^AUD-/);assert.equal(audit.legacyAuditId,'REPEATED');assert.equal(audit.legacyPayload.id,'REPEATED');});
test('transformation cannot execute or mutate source records',()=>{const tables=fixture(),original=JSON.stringify(tables),plan=planMigration(tables,{strictBaseline:false});const result=previewTransform(tables,plan);assert.equal(JSON.stringify(tables),original);assert.equal(result.canExecute,false);assert.equal(result.readyForWrites,false);});
test('unknown record type refuses transform',()=>assert.throws(()=>transformOne({recordType:'unexpected',destinationKey:{classId:'x'}},{PK:'x',SK:'y'}),/Unsupported/));
