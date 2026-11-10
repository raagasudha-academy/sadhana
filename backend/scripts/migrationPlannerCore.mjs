/** Pure M9.2 planning logic. No AWS I/O, no writes. */
import {createHash} from 'node:crypto';

export const BASELINE=Object.freeze({calendar:454,admin:14,audit:174,students:0,learning:0});
export const SOURCE_TABLES=Object.freeze({calendar:'sadhana-dev-calendar',admin:'sadhana-dev-admin',audit:'sadhana-dev-audit',students:'sadhana-dev-students',learning:'sadhana-dev-learning'});
export const TARGETS=Object.freeze({class:'sadhana-dev-classes',session:'sadhana-dev-sessions',event:'sadhana-dev-events',venue:'sadhana-dev-venues',person:'sadhana-dev-people',audit:'sadhana-dev-audit'});
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const key=(x)=>`${x.PK}\u0000${x.SK}`;
const isText=(x)=>typeof x==='string'&&x.trim().length>0;
const entry=(source,item,target,keyName,targetId,recordType,extra={})=>({source,sourceKey:{PK:item.PK,SK:item.SK},sourceHash:sha(JSON.stringify(canonical(item))),destination:target,destinationKey:{[keyName]:targetId},recordType,...extra});
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function problem(problems,code,source,item,detail){problems.push({severity:'BLOCKER',code,source,sourceKey:{PK:item?.PK??null,SK:item?.SK??null},detail});}
const identity=(x)=>`${x.institution}|${x.id}`;

export function planMigration(tables,{strictBaseline=true}={}){
 const problems=[],warnings=[],mappings=[],counts={};
 for(const k of Object.keys(SOURCE_TABLES)){
  const rows=tables[k]; if(!Array.isArray(rows))throw Error(`Missing source scan: ${k}`);
  counts[k]=rows.length;
  if(strictBaseline&&rows.length!==BASELINE[k])problems.push({severity:'BLOCKER',code:'BASELINE_DRIFT',source:k,detail:`Expected ${BASELINE[k]}, observed ${rows.length}`});
 }
 const calendar=tables.calendar, admin=tables.admin;
 const classes=new Map(),venues=new Map(),teachers=new Map(),subjectLinks=[],schedules=[],series=[];
 const targetKeys=new Map();
 function add(source,item,target,keyName,targetId,recordType,extra={}){
  if(!isText(targetId)){problem(problems,'MISSING_TARGET_ID',source,item,recordType);return;}
  const uniqueness=`${target}\u0000${targetId}`;
  if(targetKeys.has(uniqueness)){problem(problems,'DUPLICATE_TARGET_KEY',source,item,`Collides with ${targetKeys.get(uniqueness)}; review cross-institution/shared identifiers`);return;}
  targetKeys.set(uniqueness,`${source}:${item.PK}/${item.SK}`);
  mappings.push(entry(source,item,target,keyName,targetId,recordType,extra));
 }
 for(const item of calendar){
  if(!isText(item.PK)||!isText(item.SK)){problem(problems,'INVALID_SOURCE_KEY','calendar',item,'PK/SK missing');continue;}
  if(item.PK.startsWith('VENUE#')){
   const id=item.id||item.PK.slice(6);
   if(item.id&&item.id!==item.PK.slice(6))problem(problems,'VENUE_KEY_ID_MISMATCH','calendar',item,'id and PK disagree');
   add('calendar',item,TARGETS.venue,'venueId',id,'venue');venues.set(id,item);continue;
  }
  if(item.PK.startsWith('SCHEDULE_SERIES#')){
   series.push(item);const inst=item.PK.slice('SCHEDULE_SERIES#'.length);
   if(item.institution!==inst)problem(problems,'INSTITUTION_MISMATCH','calendar',item,'series PK and institution differ');
   if(!isText(item.classId)||!isText(item.effectiveFrom)||!item.changes||typeof item.changes!=='object')problem(problems,'INVALID_SERIES_RULE','calendar',item,'classId/effectiveFrom/changes required');
   // ID is deterministic; preserves effective-dated rule distinct from recurring master class.
   const id=`RULE-${sha(`${item.PK}|${item.SK}`).slice(0,26)}`;
   add('calendar',item,TARGETS.session,'sessionId',id,'series-change',{institutionId:inst,legacyClassId:item.classId,effectiveFrom:item.effectiveFrom,ruleChangesPreserved:true});continue;
  }
  if(!item.PK.startsWith('SCHEDULE#')){problem(problems,'UNMAPPED_CALENDAR_KEY','calendar',item,'Unexpected calendar PK');continue;}
  const inst=item.PK.slice('SCHEDULE#'.length);
  if(item.institution!==inst)problem(problems,'INSTITUTION_MISMATCH','calendar',item,'schedule PK and institution differ');
  if(item.SK!==`RECORD#${item.id}`)problem(problems,'SCHEDULE_KEY_ID_MISMATCH','calendar',item,'SK does not match RECORD#id');
  const t=item.recordType;
  if(t==='class'){
   add('calendar',item,TARGETS.class,'classId',item.id,t,{institutionId:inst});
   classes.set(identity(item),item);
  }else if(t==='class-session'||t==='holiday'){
   add('calendar',item,TARGETS.session,'sessionId',item.id,t,{institutionId:inst,legacyClassId:item.classId||null,allDay:!!item.allDay,localDate:item.date||null,timezone:item.timezone||'Europe/London'});
   schedules.push(item);
  }else if(t==='special-event'){
   add('calendar',item,TARGETS.event,'eventId',item.id,t,{institutionId:inst,eventKind:item.eventKind||null,managedEvent:item.managedEvent===true});
  }else problem(problems,'UNKNOWN_RECORD_TYPE','calendar',item,String(t));
 }
 for(const item of admin){
  if(item.PK==='TEACHER_REGISTRY'&&item.SK?.startsWith('TEACHER#')){
   if(item.SK!==`TEACHER#${item.id}`)problem(problems,'TEACHER_KEY_ID_MISMATCH','admin',item,'SK and id differ');
   add('admin',item,TARGETS.person,'personId',item.id,'teacher',{institutionIds:item.institutions||[],cognitoLinked:isText(item.cognitoSub)});
   teachers.set(item.id,item);
  }else if(item.PK?.startsWith('TEACHER_SUB#')&&item.SK==='LINK'){
   subjectLinks.push(item);
  }else problem(problems,'UNMAPPED_ADMIN_KEY','admin',item,'Unexpected admin record');
 }
 for(const item of subjectLinks){
  const sub=item.PK.slice('TEACHER_SUB#'.length),teacher=teachers.get(item.teacherId);
  if(!teacher)problem(problems,'ORPHAN_TEACHER_SUB','admin',item,`teacherId ${String(item.teacherId)} missing`);
  else if(teacher.cognitoSub!==sub)problem(problems,'TEACHER_SUB_MISMATCH','admin',item,'Registry cognitoSub differs from identity link');
  else mappings.push(entry('admin',item,TARGETS.person,'personId',teacher.id,'teacher-identity-merge',{mergeOnly:true}));
 }
 const subOwner=new Map();for(const teacher of teachers.values()){
  if(!isText(teacher.cognitoSub)){warnings.push({code:'TEACHER_WITHOUT_SUB',teacherId:teacher.id});continue;}
  if(subOwner.has(teacher.cognitoSub))problems.push({severity:'BLOCKER',code:'DUPLICATE_COGNITO_SUB',source:'admin',detail:'More than one teacher registry claims the same Cognito subject'});
  subOwner.set(teacher.cognitoSub,teacher.id);
  if(!subjectLinks.some(x=>x.PK===`TEACHER_SUB#${teacher.cognitoSub}`))problems.push({severity:'BLOCKER',code:'MISSING_TEACHER_SUB',source:'admin',detail:`Teacher ${teacher.id} has no reverse link`});
 }
 for(const item of schedules){
  if(item.recordType==='class-session'){
   const parent=classes.get(`${item.institution}|${item.classId}`);
   if(!parent)problem(problems,'ORPHAN_CLASS_SESSION','calendar',item,`Class ${String(item.classId)} not found in same institution`);
  }
  if(item.venueId&&!venues.has(item.venueId))problem(problems,'UNKNOWN_VENUE','calendar',item,`Venue ${item.venueId} not in venue records`);
 }
 for(const item of series){
  if(!classes.has(`${item.institution}|${item.classId}`))problem(problems,'ORPHAN_SERIES_CHANGE','calendar',item,'Series references missing master class');
 }
 for(const item of calendar){
  if(item.teacherId&&!teachers.has(item.teacherId))warnings.push({code:'TEACHER_ID_NOT_IN_REGISTRY',sourceType:item.recordType,sourceKey:{PK:item.PK,SK:item.SK}});
  if(item.recordType==='special-event'&&item.venueId&&!venues.has(item.venueId))problem(problems,'UNKNOWN_EVENT_VENUE','calendar',item,`Venue ${item.venueId} not found`);
 }
 for(const item of tables.audit){
  if(!item.PK?.startsWith('AUDIT#')||!isText(item.SK)){problem(problems,'UNMAPPED_AUDIT_KEY','audit',item,'Unexpected audit key');continue;}
  // Audit `id` is NOT globally unique in historical data. Generate a stable,
  // source-key-based ID for every event, including those with a legacy `id`.
  // Retain the original ID in the mapping and the full legacy payload for migration.
  const id=`AUD-${sha(`${item.PK}|${item.SK}`)}`;
  add('audit',item,TARGETS.audit,'auditId',id,'legacy-audit',{legacyPayloadPreserved:true,legacyAuditId:item.id||null,legacyTimestamp:item.at||null});
 }
 for(const source of ['students','learning'])for(const item of tables[source])problem(problems,'NONEMPTY_CLEAN_SLATE',source,item,'M8 expected zero records; manually classify before migration');
 const byType={};for(const m of mappings)byType[m.recordType]=(byType[m.recordType]||0)+1;
 const destinationCounts={};for(const m of mappings)if(!m.mergeOnly)destinationCounts[m.destination]=(destinationCounts[m.destination]||0)+1;
 const uniqueLinks=subjectLinks.length, baseCount=Object.values(counts).reduce((a,b)=>a+b,0);
 const summary={schema:1,readOnly:true,canExecute:false,sourceCounts:counts,sourceTotal:baseCount,sourceMapped:mappings.length,destinationCounts,recordTypes:byType,teacherIdentityLinks:uniqueLinks,targetItemsEstimated:mappings.filter(m=>!m.mergeOnly).length,blockerCount:problems.length,warningCount:warnings.length,readyForMappingReview:problems.length===0&&mappings.length===baseCount};
 return {summary,mappings,problems,warnings};
}
