import {entityTable} from './entityTables.mjs';
/**
 * M9 experimental entity-table reader. NOT connected to the existing Lambda/router.
 * No write operations are offered. Explicit opt-in is required even for reads.
 */
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand} from '@aws-sdk/lib-dynamodb';

export const M9_TARGET_KEYS={
 institutions:'institutionId',people:'personId',families:'familyId','family-links':'linkId',
 classes:'classId',venues:'venueId',enrolments:'enrolmentId',sessions:'sessionId',
 attendance:'attendanceId',practice:'practiceId',homework:'homeworkId',submissions:'submissionId',
 events:'eventId',rsvps:'rsvpId',registrations:'registrationId',notifications:'notificationId',
 audit:'auditId',counters:'counterId'
} as const;
export type M9Entity=keyof typeof M9_TARGET_KEYS;
export type M9QueryIndex=
 | 'CognitoIdentityIndex'|'PersonTypeIndex'|'PrimaryContactIndex'|'FamilyMembersIndex'
 | 'GuardianAccessIndex'|'StudentGuardiansIndex'|'InstitutionClassesIndex'
 | 'StudentEnrolmentsIndex'|'ClassEnrolmentsIndex'|'InstitutionSessionsIndex'
 | 'ClassSessionsIndex'|'SeriesOccurrencesIndex'|'StudentAttendanceIndex'
 | 'SessionAttendanceIndex'|'StudentPracticeIndex'|'ClassPracticeIndex'
 | 'ClassHomeworkIndex'|'TeacherHomeworkIndex'|'HomeworkSubmissionsIndex'
 | 'StudentSubmissionsIndex'|'InstitutionEventsIndex'|'OrganiserEventsIndex'
 | 'EventResponsesIndex'|'StudentResponsesIndex'|'InstitutionRegistrationsIndex'
 | 'ExternalRegistrationIndex'|'FamilyRegistrationsIndex'|'RecipientNotificationsIndex'
 | 'DeliveryQueueIndex'|'ProviderMessageIndex'|'InstitutionAuditIndex'|'ActorAuditIndex'
 | 'ResourceAuditIndex';
const allowIndexes:Partial<Record<M9Entity, readonly string[]>>={
 people:['CognitoIdentityIndex','PersonTypeIndex'],families:['PrimaryContactIndex'],
 'family-links':['FamilyMembersIndex','GuardianAccessIndex','StudentGuardiansIndex'],
 classes:['InstitutionClassesIndex'],enrolments:['StudentEnrolmentsIndex','ClassEnrolmentsIndex'],
 sessions:['InstitutionSessionsIndex','ClassSessionsIndex','SeriesOccurrencesIndex'],
 attendance:['StudentAttendanceIndex','SessionAttendanceIndex'],practice:['StudentPracticeIndex','ClassPracticeIndex'],
 homework:['ClassHomeworkIndex','TeacherHomeworkIndex'],submissions:['HomeworkSubmissionsIndex','StudentSubmissionsIndex'],
 events:['InstitutionEventsIndex','OrganiserEventsIndex'],rsvps:['EventResponsesIndex','StudentResponsesIndex'],
 registrations:['InstitutionRegistrationsIndex','ExternalRegistrationIndex','FamilyRegistrationsIndex'],
 notifications:['RecipientNotificationsIndex','DeliveryQueueIndex','ProviderMessageIndex'],
 audit:['InstitutionAuditIndex','ActorAuditIndex','ResourceAuditIndex']
};
const INDEX_KEY:Record<string,string>={
 CognitoIdentityIndex:'cognitoSub',PersonTypeIndex:'directoryGroup',PrimaryContactIndex:'primaryContactPersonId',
 FamilyMembersIndex:'familyId',GuardianAccessIndex:'guardianPersonId',StudentGuardiansIndex:'studentId',
 InstitutionClassesIndex:'institutionId',StudentEnrolmentsIndex:'studentId',ClassEnrolmentsIndex:'classId',
 InstitutionSessionsIndex:'institutionId',ClassSessionsIndex:'classId',SeriesOccurrencesIndex:'seriesId',
 StudentAttendanceIndex:'studentId',SessionAttendanceIndex:'sessionId',StudentPracticeIndex:'studentId',
 ClassPracticeIndex:'classId',ClassHomeworkIndex:'classId',TeacherHomeworkIndex:'teacherPersonId',
 HomeworkSubmissionsIndex:'homeworkId',StudentSubmissionsIndex:'studentId',
 InstitutionEventsIndex:'institutionId',OrganiserEventsIndex:'organiserPersonId',
 EventResponsesIndex:'rsvpTargetKey',StudentResponsesIndex:'studentId',
 InstitutionRegistrationsIndex:'institutionId',ExternalRegistrationIndex:'externalRegistrationKey',
 FamilyRegistrationsIndex:'familyId',RecipientNotificationsIndex:'recipientPersonId',
 DeliveryQueueIndex:'deliveryQueueStatus',ProviderMessageIndex:'providerMessageId',
 InstitutionAuditIndex:'institutionId',ActorAuditIndex:'actorPersonId',ResourceAuditIndex:'resourceKey'
};
export type M9DocumentClient=Pick<DynamoDBDocumentClient,'send'>;
export function makeM9TargetReader(client:M9DocumentClient,options:{env?:'dev'|'test';enabled?:boolean}={}){
 const env=options.env??'dev';
 const allowed=options.enabled===true && process.env.M9_TARGET_REPOSITORY_ENABLED==='read-only';
 const check=()=>{if(!allowed)throw Error('M9 target reader is disabled; set M9_TARGET_REPOSITORY_ENABLED=read-only and opt in explicitly');};
 const tableName=(entity:M9Entity)=>{if(!Object.hasOwn(M9_TARGET_KEYS,entity))throw Error('Unknown M9 entity table');return entityTable(entity,{stage:env});};
 return {
  async get(entity:M9Entity,id:string){
   check();if(!id)throw Error('Primary key value required');
   const key=M9_TARGET_KEYS[entity];
   const result=await client.send(new GetCommand({TableName:tableName(entity),Key:{[key]:id},ConsistentRead:true}));
   return result.Item??null;
  },
  async queryIndex(entity:M9Entity,index:M9QueryIndex,partitionValue:string,limit=100){
   check();if(!allowIndexes[entity]?.includes(index))throw Error(`Index ${index} is not approved for ${entity}`);
   if(!partitionValue||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid index query arguments');
   const pk=INDEX_KEY[index];
   const result=await client.send(new QueryCommand({TableName:tableName(entity),IndexName:index,KeyConditionExpression:'#pk = :pk',ExpressionAttributeNames:{'#pk':pk},ExpressionAttributeValues:{':pk':partitionValue},Limit:limit}));
   return {items:result.Items??[],lastEvaluatedKey:result.LastEvaluatedKey??null};
  }
 };
}
export function makeM9TargetReaderClient(region='us-east-1'){
 return DynamoDBDocumentClient.from(new DynamoDBClient({region}),{marshallOptions:{removeUndefinedValues:true}});
}
