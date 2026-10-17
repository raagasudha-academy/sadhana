import {makeRoutedClient} from './tableRouter.ts';
/** DynamoDB data access. All operations require a verified server-side user identity. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ALLOWED_FIELDS, clean, demandAnyAdmin, demandInstitution, demandViewInstitution, directoryFor, fieldsOnly, httpError, keyFor, newId, permittedInstitutions, publicRecord, validate } from './model.ts';
import type { Claims, Draft, InstitutionId, ResourceName } from './model.ts';

export interface PracticeChange {
  institution: InstitutionId;
  studentId: string;
  date: string;
  expectedVersion: number;
  reason?: string;
  didPractice?: boolean;
  minutes?: number;
  comments?: string;
}
export interface RepositoryOptions { tableName?: string; region?: string; client?: DynamoDBDocumentClient }
export class SadhanaRepository {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  constructor({tableName=process.env.SADHANA_TABLE_NAME,region=process.env.AWS_REGION,client}: RepositoryOptions={}) {
    if(!tableName) throw new Error('SADHANA_TABLE_NAME is required');
    this.tableName=tableName;
    this.client=client ?? makeRoutedClient(region);
  }
  async get(resource,entity) {
    const Key=keyFor(resource,entity);
    const r=await this.client.send(new GetCommand({TableName:this.tableName,Key,ConsistentRead:true}));
    return r.Item ?? null;
  }
  async query(pk: string,{index='GSI1',sortPrefix,limit=100}:{index?:'GSI1'|'GSI2';sortPrefix?:string;limit?:number}={}){
    const result=[];let last;
    // Cap a single request; avoid unbounded database scans and responses.
    do{
      const q={TableName:this.tableName,IndexName:index,KeyConditionExpression:'#p = :p',ExpressionAttributeNames:{'#p':`${index}PK`},ExpressionAttributeValues:{':p':pk},Limit:Math.min(limit-result.length,100),ExclusiveStartKey:last};
      if(sortPrefix){q.KeyConditionExpression+=' AND begins_with(#s,:s)';q.ExpressionAttributeNames['#s']=`${index}SK`;q.ExpressionAttributeValues[':s']=sortPrefix;}
      const out=await this.client.send(new QueryCommand(q));result.push(...(out.Items||[]));last=out.LastEvaluatedKey;
    }while(last&&result.length<limit);
    return {items:result,nextPage:!!last};
  }
  async queryBase(pk,limit=200){
    const rows=[];let last;
    do{
      const out=await this.client.send(new QueryCommand({TableName:this.tableName,KeyConditionExpression:'#p=:p',ExpressionAttributeNames:{'#p':'PK'},ExpressionAttributeValues:{':p':pk},Limit:Math.min(100,limit-rows.length),ExclusiveStartKey:last,ConsistentRead:true}));
      rows.push(...(out.Items||[]));last=out.LastEvaluatedKey;
    }while(last&&rows.length<limit);
    return {items:rows,nextPage:!!last};
  }
  async auditPut({inst,claims,type,resource,id,details}){
    // Audit events are kept within institution-specific partitions, never returned to teachers.
    const ts=new Date().toISOString();return {
      PK:`AUDIT#${inst}`,SK:`AT#${ts}#${newId('EVT')}`,entityType:'AUDIT',type,resource,id,details,
      actorSub:claims.sub,at:ts
    };
  }
  txPut(item: Draft,condition?: string){return {Put:{TableName:this.tableName,Item:item,...(condition?{ConditionExpression:condition}:{})}};}
  async transact(actions){
    try{await this.client.send(new TransactWriteCommand({TransactItems:actions}));}
    catch(e){if(e.name==='TransactionCanceledException')throw httpError(409,'Record was changed or already exists. Refresh and try again.');throw e;}
  }
  async ensureVisible(item,inst){
    if(!item||!(item.visibleIn||[item.createdIn]).includes(inst))throw httpError(404,'Record not found in your institution.');
  }
  async list(resource: ResourceName,inst: InstitutionId,claims: Claims,{studentId}:{studentId?:string}={}){
    // Teachers/viewers may read timetables and venues only; no student, family or practice exports.
    if(resource==='venues'||resource==='classes')demandViewInstitution(claims,inst);
    else demandInstitution(claims,inst);
    if(resource==='practice'){
      if(!studentId)throw httpError(400,'studentId is required for practice history.');
      const student=await this.get('students',{id:studentId});await this.ensureVisible(student,inst);
      const {items,nextPage}=await this.queryBase(`PRACTICE#${inst}#${studentId}`);
      return {records:items.map(publicRecord),more:nextPage};
    }
    const partition=resource==='families'?'DIRECTORY#FAMILY':resource==='students'?'DIRECTORY#STUDENT':resource==='venues'?'DIRECTORY#VENUE':`INST#${inst}#${resource==='classes'?'CLASS':'ENROLMENT'}`;
    const {items,nextPage}=await this.query(partition,{limit:300});
    const filtered=resource==='families'||resource==='students'?items.filter(x=>(x.visibleIn||[x.createdIn]).includes(inst)):items;
    return {records:filtered.map(publicRecord),more:nextPage};
  }
  async identitySearch(claims,q){
    demandAnyAdmin(claims);
    const search=clean(q).toLocaleLowerCase('en-GB');
    if(search.length<3||search.length>100)throw httpError(400,'Enter at least three characters of a name.');
    const families=await this.query('DIRECTORY#FAMILY',{sortPrefix:`NAME#${search}`,limit:20});
    const students=await this.query('DIRECTORY#STUDENT',{sortPrefix:`NAME#${search}`,limit:20});
    return {
      families:families.items.map(r=>({id:r.id,parentName:r.parentName,phoneLast4:r.phone?.slice(-4)||''})),
      students:students.items.map(r=>({id:r.id,name:r.name,familyId:r.familyId||null})),
      more:families.nextPage||students.nextPage
    };
  }
  async linkForInstitution(item,inst){
    if((item.visibleIn||[]).includes(inst))return null;
    const next={...item,visibleIn:[...new Set([...(item.visibleIn||[item.createdIn]),inst])],version:item.version+1,updatedAt:new Date().toISOString()};
    return {Put:{TableName:this.tableName,Item:next,ConditionExpression:'#v=:v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':item.version}}};
  }
  async create(resource,input,inst,claims){
    demandInstitution(claims,inst);
    const d=validate(resource,input);
    if(['classes','enrolments','practice'].includes(resource)&&d.institution!==inst)throw httpError(403,'Cannot write records for another institution.');
    if(['families','students'].includes(resource)&&d.createdIn!==inst)throw httpError(403,'Registration institution mismatch.');
    if(resource==='students'&&d.familyId){const family=await this.get('families',{id:d.familyId});if(!family)throw httpError(404,'Parent family record not found.');}
    let student,classItem,family;
    if(resource==='enrolments'){
      student=await this.get('students',{id:d.studentId});classItem=await this.get('classes',{id:d.classId});
      if(!student||!classItem||classItem.archived||classItem.institution!==inst)throw httpError(400,'Student/class combination is invalid.');
      if(student.familyId)family=await this.get('families',{id:student.familyId});
      const exists=await this.query(`CLASS#${d.classId}`,{index:'GSI2',sortPrefix:`STUDENT#${d.studentId}#`,limit:100});
      if(exists.items.some(x=>!x.archived&&!(x.endDate&&x.endDate<d.startDate)&&!(d.endDate&&d.endDate<x.startDate)))throw httpError(409,'Student already has an overlapping enrolment in this class.');
    }
    if(resource==='classes'&&d.mode==='In Person'){
      if(!(await this.get('venues',{id:d.venueId})))throw httpError(400,'Venue must exist in the shared venue directory.');
    }
    if(resource==='practice'){
      student=await this.get('students',{id:d.studentId});await this.ensureVisible(student,inst);
      const entries=await this.query(`INST#${inst}#ENROLMENT`,{sortPrefix:`STUDENT#${d.studentId}#`,limit:150});
      if(!entries.items.some(e=>e.startDate<=d.date&&(!e.endDate||e.endDate>=d.date)))throw httpError(409,'The student was not enrolled on the practice date.');
    }
    const now=new Date().toISOString();
    const newItem: Draft={...d,id:resource==='practice'?`PRACTICE-${inst}-${d.studentId}-${d.date}`:newId(resource.toUpperCase()),entityType:resource.toUpperCase(),createdAt:now,updatedAt:now,version:1,archived:false,...(resource==='families'||resource==='students'?{visibleIn:[inst]}:{})};
    if(resource==='practice'){newItem.source='Administrator Recorded';newItem.status='Active';}
    Object.assign(newItem,keyFor(resource,newItem),directoryFor(resource,newItem));
    const audit=await this.auditPut({inst,claims,type:'CREATE',resource,id:newItem.id,details:{}});
    const actions=[this.txPut(newItem,'attribute_not_exists(PK)'),this.txPut(audit)];
    if(resource==='enrolments'){
      for(const row of [student,family].filter(Boolean)){
        const update=await this.linkForInstitution(row,inst);
        if(update)actions.push(update);
      }
    }
    await this.transact(actions);
    return publicRecord(newItem);
  }
  async patch(resource,id,input,inst,claims){
    demandInstitution(claims,inst);
    if(resource==='venues'){
return await this.patchVenue(id,input,inst,claims);
    }
    if(resource==='practice')throw httpError(400,'Use the practice correction route with a date and student ID.');
    const current=await this.get(resource,{id});
    if(!current)throw httpError(404,'Record not found.');
    if(resource==='families'||resource==='students')await this.ensureVisible(current,inst);
    else if(current.institution!==inst)throw httpError(404,'Record not found in this institution.');
    if(!input||typeof input!=='object'||Array.isArray(input))throw httpError(400,'Expected changes with expectedVersion.');
    const expectedVersion=input.expectedVersion;
    if(!Number.isInteger(expectedVersion)||expectedVersion!==current.version)throw httpError(409,'This record has changed. Refresh before editing.');
    const {expectedVersion:_discard,...updates}=input;
    if(['families','students'].includes(resource)&&updates.createdIn&&updates.createdIn!==current.createdIn)throw httpError(400,'Registration institution is immutable.');
    if(['classes','enrolments'].includes(resource)&&updates.institution&&updates.institution!==current.institution)throw httpError(400,'Institution is immutable.');
    if(resource==='enrolments'&&(updates.studentId&&updates.studentId!==current.studentId||updates.classId&&updates.classId!==current.classId))throw httpError(400,'Student and class cannot be reassigned inside an enrolment. Create a new enrolment.');
    if(resource==='students'&&updates.familyId!==undefined&&updates.familyId!==current.familyId)throw httpError(400,'Changing a Family ID requires a separate verified identity-linking workflow.');
    if(resource==='classes'&&updates.venueId&&updates.venueId!==current.venueId){
      if(!(await this.get('venues',{id:updates.venueId})))throw httpError(400,'Requested venue does not exist.');
    }
    const merged=validate(resource,Object.fromEntries(ALLOWED_FIELDS[resource].map(f=>[f,f in updates?updates[f]:current[f]])));
    const next: Draft={...current,...merged,updatedAt:new Date().toISOString(),version:current.version+1};
    Object.assign(next,directoryFor(resource,next));
    // Remove stale phone lookup keys when the person's phone is cleared.
    if(resource==='students'&&!next.phone){delete next.GSI2PK;delete next.GSI2SK;}
    const changed=ALLOWED_FIELDS[resource].filter(k=>JSON.stringify(current[k])!==JSON.stringify(next[k]));
    const audit=await this.auditPut({inst,claims,type:'UPDATE',resource,id,details:{changed,previous:Object.fromEntries(changed.map(k=>[k,current[k]]))}});
    await this.transact([{Put:{TableName:this.tableName,Item:next,ConditionExpression:'#version = :v',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':v':expectedVersion}}},this.txPut(audit)]);
    return publicRecord(next);
  }
  /** Central venue edit. Only the VENUE item plus audit are written; calendar rows stay unchanged. */
  async patchVenue(id:string,input:unknown,inst:InstitutionId,claims:Claims){
    if(!/^[-a-zA-Z0-9]{4,100}$/.test(id))throw httpError(400,'Invalid venue ID.');
    if(!input||typeof input!=='object'||Array.isArray(input))throw httpError(400,'Expected venue changes with expectedVersion.');
    const expectedVersion=(input as Draft).expectedVersion;
    if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw httpError(400,'expectedVersion must be a positive integer.');
    const {expectedVersion:_discard,...rawUpdates}=input as Draft;
    const updates=fieldsOnly(rawUpdates,ALLOWED_FIELDS.venues);
    if(!Object.keys(updates).length)throw httpError(400,'No venue changes supplied.');
    const current=await this.get('venues',{id});
    if(!current)throw httpError(404,'Venue not found.');
    if(current.version!==expectedVersion)throw httpError(409,'This venue was changed elsewhere. Refresh and try again.');
    const merged=validate('venues',Object.fromEntries(ALLOWED_FIELDS.venues.map(f=>[f,f in updates?updates[f]:current[f]])));
    const changed=ALLOWED_FIELDS.venues.filter(f=>JSON.stringify(current[f]??'')!==JSON.stringify(merged[f]??''));
    if(!changed.length)return publicRecord(current);
    const next={...current,...merged,updatedAt:new Date().toISOString(),version:current.version+1};
    Object.assign(next,directoryFor('venues',next));
    const audit=await this.auditPut({inst,claims,type:'UPDATE',resource:'venues',id,details:{changed,previous:Object.fromEntries(changed.map(f=>[f,current[f]??'']))}});
    await this.transact([{Put:{TableName:this.tableName,Item:next,ConditionExpression:'attribute_exists(PK) AND #v = :expected',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':expected':expectedVersion}}},this.txPut(audit)]);
    return publicRecord(next);
  }
  async correctPractice({studentId,date,institution,expectedVersion,...changes}: PracticeChange,claims: Claims){
    demandInstitution(claims,institution);
    const current=await this.get('practice',{studentId,date,institution});
    if(!current)throw httpError(404,'Practice entry not found.');
    if(!Number.isInteger(expectedVersion)||expectedVersion!==current.version)throw httpError(409,'This practice entry was modified; refresh first.');
    if(current.status==='Voided')throw httpError(409,'Voided entries cannot be edited.');
    const d=validate('practice',{institution,studentId,date,didPractice:changes.didPractice??current.didPractice,minutes:changes.minutes??current.minutes,comments:changes.comments??current.comments,reason:changes.reason});
    const next={...current,...d,version:current.version+1,source:'Administrator Corrected',updatedAt:new Date().toISOString()};
    const audit=await this.auditPut({inst:institution,claims,type:'PRACTICE_CORRECTION',resource:'practice',id:current.id,details:{reason:d.reason,previous:{didPractice:current.didPractice,minutes:current.minutes,comments:current.comments}}});
    await this.transact([{Put:{TableName:this.tableName,Item:next,ConditionExpression:'#v = :v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':expectedVersion}}},this.txPut(audit)]);
    return publicRecord(next);
  }
  async voidPractice({institution,studentId,date,reason,expectedVersion}: PracticeChange,claims: Claims){
    demandInstitution(claims,institution);
    if(!clean(reason))throw httpError(400,'A void reason is required.');
    const current=await this.get('practice',{institution,studentId,date});
    if(!current)throw httpError(404,'Practice entry not found.');
    if(!Number.isInteger(expectedVersion)||expectedVersion!==current.version)throw httpError(409,'This practice entry was modified; refresh first.');
    if(current.status==='Voided')throw httpError(409,'Already voided.');
    const next={...current,status:'Voided',version:current.version+1,updatedAt:new Date().toISOString()};
    const audit=await this.auditPut({inst:institution,claims,type:'PRACTICE_VOID',resource:'practice',id:current.id,details:{reason:clean(reason)}});
    await this.transact([{Put:{TableName:this.tableName,Item:next,ConditionExpression:'#v = :v',ExpressionAttributeNames:{'#v':'version'},ExpressionAttributeValues:{':v':expectedVersion}}},this.txPut(audit)]);
    return publicRecord(next);
  }
}
