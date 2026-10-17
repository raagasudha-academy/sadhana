/**
 * One-off venue backfill for the already-imported v0.7 academy timetable.
 * Creates three shared VENUE directory items and links the 7 master classes
 * and 252 dated class sessions by venueId. Preserves existing addresses,
 * dates, times, teachers, class IDs, attendance and unrelated events.
 *
 * Dry-run (default): npm --prefix backend run link:venues -- --table sadhana-dev-main
 * Apply after PITR review: npm --prefix backend run link:venues -- --table sadhana-dev-main --apply --confirm LINK-3-VENUES
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient, DescribeContinuousBackupsCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { directoryFor, keyFor, validate } from '../src/model.ts';
import { schedulePK, scheduleSK } from '../src/scheduleModel.ts';
import type { ScheduleRecord } from '../src/scheduleModel.ts';

import { VENUES } from '../src/academyVenues.ts';
import type { Venue } from '../src/academyVenues.ts';

const args=process.argv.slice(2);
const arg=(name:string)=>{const index=args.indexOf(name);return index<0?'':args[index+1]||'';};
const table=arg('--table');
const apply=args.includes('--apply');
if(!/^sadhana-(dev|staging|prod)-main$/.test(table))throw Error('Usage: npm --prefix backend run link:venues -- --table sadhana-dev-main [--apply --confirm LINK-3-VENUES]');
if(apply&&arg('--confirm')!=='LINK-3-VENUES')throw Error('Writes require --apply --confirm LINK-3-VENUES');

const manifestPath=resolve(dirname(fileURLToPath(import.meta.url)),'../import-data/academy-calendar-v0.7.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')) as {classes:ScheduleRecord[];events:ScheduleRecord[]};
const targets=[...manifest.classes,...manifest.events.filter(r=>r.recordType==='class-session')];
const lookup=new Map<string,Venue>();
for(const venue of VENUES)for(const classId of venue.masterIds) {
 if(lookup.has(classId))throw Error('Duplicate venue definition for '+classId);
 lookup.set(classId,venue);
}
if(manifest.classes.length!==7||targets.length!==259||lookup.size!==7)throw Error('Original v0.7 import manifest no longer matches the reviewed 7 masters and 252 sessions');
const targetWithVenue=targets.map(record=>{
 const venue=lookup.get(record.recordType==='class'?record.id:record.classId||'');
 if(!venue||record.mode!=='In-person'&&record.mode!=='In Person')throw Error('Unrecognised master class or mode '+record.id);
 // The source manifest uses full calendar location text. These must match the venue's actual source address.
 if(record.location!==venue.address)throw Error('Venue address mismatch in original import for '+record.id);
 return {record,venue};
});
const dbClient=new DynamoDBClient({});
const db=DynamoDBDocumentClient.from(dbClient,{marshallOptions:{removeUndefinedValues:true}});
const fetchPartition=async(inst:'raaga'|'sruti')=>{
 const out=new Map<string,Record<string,any>>();let next:Record<string,unknown>|undefined;
 do{
  const page=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':schedulePK(inst)},ConsistentRead:true,ExclusiveStartKey:next}));
  for(const item of page.Items||[])out.set(item.SK,item);
  next=page.LastEvaluatedKey;
 }while(next);
 return out;
};
const [raaga,sruti]=await Promise.all([fetchPartition('raaga'),fetchPartition('sruti')]);
const mapping={raaga,sruti};
const recordsToUpdate:{item:Record<string,any>;venue:Venue;institution:'raaga'|'sruti'}[]=[];
const existingLinks:{institution:string;id:string}[]=[];
for(const {record,venue} of targetWithVenue){
 if(record.institution!=='raaga'&&record.institution!=='sruti')throw Error('Invalid master institution '+record.id);
 const found=mapping[record.institution].get(scheduleSK(record.id));
 if(!found)throw Error('Missing imported schedule record '+record.id+'; backfill stopped');
 if(found.recordType!==record.recordType||found.classId!==record.classId||found.location!==venue.address)throw Error('Imported record changed from expected location/class; review '+record.id);
 if(!Number.isInteger(found.version)||found.version<1)throw Error('Missing concurrency version '+record.id);
 if(found.venueId&&found.venueId!==venue.id)throw Error('An imported record is already linked to another venue: '+record.id);
 if(found.venueId===venue.id)existingLinks.push({institution:record.institution,id:record.id});
 else recordsToUpdate.push({item:found,venue,institution:record.institution});
}

// Shared venue directory is an existing DynamoDB resource, not a schedule event.
const foundVenueList=await db.send(new QueryCommand({TableName:table,IndexName:'GSI1',KeyConditionExpression:'GSI1PK = :p',ExpressionAttributeValues:{':p':'DIRECTORY#VENUE'}}));
if(foundVenueList.LastEvaluatedKey)throw Error('More than one venue directory page; stop and reconcile before importing');
const existingDirectory=foundVenueList.Items||[];
const venuesToCreate:Venue[]=[];
for(const venue of VENUES){
 const item=(await db.send(new GetCommand({TableName:table,Key:{PK:`VENUE#${venue.id}`,SK:'META'},ConsistentRead:true}))).Item;
 if(item){
  if(item.name!==venue.name||item.location!==venue.location||item.address!==venue.address)throw Error('Existing venue ID has different details: '+venue.id);
  continue;
 }
 if(existingDirectory.some(x=>(x.address||'').trim().toLowerCase()===venue.address.toLowerCase()||x.name?.trim().toLowerCase()===venue.name.toLowerCase()))throw Error('A venue with same address/name exists under a different ID: '+venue.name);
 venuesToCreate.push(venue);
}
const summary={mode:apply?'apply':'dry-run',table,
 venues:{toCreate:venuesToCreate.map(({id,name,location,address})=>({id,name,location,address})),alreadyExist:3-venuesToCreate.length},
 scheduleLinks:{toCreate:recordsToUpdate.length,alreadyLinked:existingLinks.length,masters:7,sessions:252},
 expected:{venues:3,scheduleLinks:259},
 changesToGoogleCalendar:0};
if(!apply){console.log(JSON.stringify(summary,null,2));console.log('DRY RUN: no DynamoDB writes. Apply only after confirming the three addresses.');process.exit(0);}
const status=(await dbClient.send(new DescribeContinuousBackupsCommand({TableName:table}))).ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus;
if(status!=='ENABLED')throw Error('DynamoDB PITR must be ENABLED before writing (currently '+status+')');
let added=0,linked=0;
for(const venue of venuesToCreate){
 const data={...validate('venues',{name:venue.name,location:venue.location,address:venue.address}),id:venue.id,archived:false,entityType:'VENUES',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 try{await db.send(new PutCommand({TableName:table,Item:{...data,...keyFor('venues',data),...directoryFor('venues',data)},ConditionExpression:'attribute_not_exists(PK) AND attribute_not_exists(SK)'}));added++;}
 catch(error){if((error as Error).name==='ConditionalCheckFailedException')throw Error('Concurrent venue creation detected. Rerun dry-run before continuing.');throw error;}
}
for(const entry of recordsToUpdate){
 try{
  await db.send(new PutCommand({TableName:table,
   Item:{...entry.item,venueId:entry.venue.id,updatedAt:new Date().toISOString(),version:entry.item.version+1},
   ConditionExpression:'#v = :expected AND attribute_not_exists(venueId)',
   ExpressionAttributeNames:{'#v':'version'},
   ExpressionAttributeValues:{':expected':entry.item.version}}));
  linked++;
  if(linked%40===0)console.log('Linked '+linked+'/'+recordsToUpdate.length+' schedule records...');
 }catch(error){if((error as Error).name==='ConditionalCheckFailedException')throw Error('Concurrent session edit or link detected at '+entry.item.id+'. Stop, rerun dry-run; completed links are retained.');throw error;}
}
console.log(JSON.stringify({...summary,mode:'applied',venuesAdded:added,scheduleRecordsLinked:linked},null,2));
console.log('Finished. Relaunch the portal with updated v0.7.1 frontend and open Venues or the calendar.');
