#!/usr/bin/env node
/** Read-only compare real legacy and M9 schedule/managed-event/teacher/venue reads.
 * Invoke with node --import tsx; never writes to DynamoDB or changes Lambda.
 */
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
import {SadhanaRepository} from '../src/repository.ts';
import {listSchedule} from '../src/scheduleStore.ts';
import {listManagedEvents} from '../src/eventManagement.ts';
import {listTeachers,myTeacherIdentity} from '../src/teacherDirectory.ts';
import {makeM95CompatibilityReader,canonicalRecords} from '../src/compatibility.ts';
import {makeM95DirectoryReader,sameDirectoryRows} from '../src/directoryCompatibility.ts';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--report'||!args[1]||args[1].startsWith('-'))throw Error('Usage: node --import tsx scripts/verifyReadParity.mjs --report ./live-parity.json');
if(process.env.AWS_REGION!=='us-east-1'||process.env.SADHANA_DATA_MODE!=='split'||process.env.SADHANA_TABLE_NAME!=='sadhana-dev-main')throw Error('Require AWS_REGION=us-east-1 SADHANA_DATA_MODE=split SADHANA_TABLE_NAME=sadhana-dev-main');
const claims={sub:'m9-read-only-verifier-no-real-login','cognito:groups':['raagasudha-admin','sruti-admin']};
const doc=DynamoDBDocumentClient.from(new DynamoDBClient({region:'us-east-1'}),{marshallOptions:{removeUndefinedValues:true}});
const m9=makeM95CompatibilityReader(doc);
const dirs=makeM95DirectoryReader(doc,async()=> '');
const legacyRepo=new SadhanaRepository();
const digest=rows=>createHash('sha256').update(canonicalRecords(rows)).digest('hex');
const parity={};
function record(key,oldRows,newRows,{ignorePhoto=false}={}){
 const normalized=rows=>ignorePhoto?rows.map(({photoUrl,...rest})=>rest):rows;
 const old=normalized(oldRows),next=normalized(newRows);
 parity[key]={same:ignorePhoto?sameDirectoryRows(oldRows,newRows):canonicalRecords(oldRows)===canonicalRecords(newRows),legacyCount:old.length,m9Count:next.length,legacyDigest:digest(old),m9Digest:digest(next)};
}
for(const inst of ['raaga','sruti','shared']){
 const [old,next]=await Promise.all([listSchedule(inst,claims),m9.schedule(inst)]);
 record(`${inst}.schedule`,old.records,next.records);
}
for(const inst of ['raaga','sruti']){
 const [oldEvents,nextEvents,oldTeachers,nextTeachers,oldVenues,nextVenues,oldMe,nextMe]=await Promise.all([
  listManagedEvents(inst,claims),m9.managedEvents(inst),listTeachers(inst,claims),dirs.teachers(inst,claims),
  legacyRepo.list('venues',inst,claims),dirs.venues(inst,claims),myTeacherIdentity(inst,claims),dirs.teacherMe(inst,claims),
 ]);
 record(`${inst}.events`,oldEvents.records,nextEvents.records);
 record(`${inst}.teachers`,oldTeachers.records,nextTeachers.records,{ignorePhoto:true});
 record(`${inst}.venues`,oldVenues.records,nextVenues.records);
 record(`${inst}.teacherMe`,[oldMe],[nextMe]);
}
const result={schema:1,readOnly:true,canExecute:false,region:'us-east-1',target:'sadhana-dev-m9',verifiedAt:new Date().toISOString(),parity,allMatch:Object.values(parity).every(x=>x.same),notes:['Legacy teacher directory comparison excludes volatile signed photo URLs.','This is a direct database/API projection comparison, not a deployed HTTP auth or IAM test.']};
writeFileSync(args[1],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({report:args[1],allMatch:result.allMatch,comparisons:Object.fromEntries(Object.entries(parity).map(([k,v])=>[k,{same:v.same,legacyCount:v.legacyCount,m9Count:v.m9Count}]))},null,2));
if(!result.allMatch)process.exitCode=2;
