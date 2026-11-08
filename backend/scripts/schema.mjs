/** M9.3 proposed physical table schema: declarative, no AWS calls. */
const pk=(name)=>({partitionKey:name});
const g=(name,partitionKey,sortKey)=>({name,partitionKey,...(sortKey?{sortKey}:{})});
const d=(suffix,key,indexes=[])=>({tableName:`sadhana-dev-${suffix}`,...pk(key),indexes});
export const M9_SCHEMA=Object.freeze([
 d('institutions','institutionId'),
 d('people','personId',[g('CognitoIdentityIndex','cognitoSub'),g('PersonTypeIndex','directoryGroup','displayNameSort')]),
 d('families','familyId',[g('PrimaryContactIndex','primaryContactPersonId','familyId')]),
 d('family-links','linkId',[g('FamilyMembersIndex','familyId','personId'),g('GuardianAccessIndex','guardianPersonId','studentId'),g('StudentGuardiansIndex','studentId','guardianPersonId')]),
 d('classes','classId',[g('InstitutionClassesIndex','institutionId','nameSort')]),
 d('venues','venueId'),
 d('enrolments','enrolmentId',[g('StudentEnrolmentsIndex','studentId','classId'),g('ClassEnrolmentsIndex','classId','studentId')]),
 d('sessions','sessionId',[g('InstitutionSessionsIndex','institutionId','startAt'),g('ClassSessionsIndex','classId','startAt'),g('SeriesOccurrencesIndex','seriesId','startAt')]),
 d('attendance','attendanceId',[g('StudentAttendanceIndex','studentId','sessionDateKey'),g('SessionAttendanceIndex','sessionId','studentId')]),
 d('practice','practiceId',[g('StudentPracticeIndex','studentId','practiceDateKey'),g('ClassPracticeIndex','classId','practiceDateKey')]),
 d('homework','homeworkId',[g('ClassHomeworkIndex','classId','publishAt'),g('TeacherHomeworkIndex','teacherPersonId','createdAt')]),
 d('submissions','submissionId',[g('HomeworkSubmissionsIndex','homeworkId','studentId'),g('StudentSubmissionsIndex','studentId','submittedAt')]),
 d('events','eventId',[g('InstitutionEventsIndex','institutionId','startAt'),g('OrganiserEventsIndex','organiserPersonId','startAt')]),
 d('rsvps','rsvpId',[g('EventResponsesIndex','rsvpTargetKey','studentId'),g('StudentResponsesIndex','studentId','respondedAt')]),
 d('registrations','registrationId',[g('InstitutionRegistrationsIndex','institutionId','submittedAt'),g('ExternalRegistrationIndex','externalRegistrationKey'),g('FamilyRegistrationsIndex','familyId','submittedAt')]),
 d('notifications','notificationId',[g('RecipientNotificationsIndex','recipientPersonId','createdAt'),g('DeliveryQueueIndex','deliveryQueueStatus','scheduledAt'),g('ProviderMessageIndex','providerMessageId')]),
 d('audit','auditId',[g('InstitutionAuditIndex','institutionId','timestamp'),g('ActorAuditIndex','actorPersonId','timestamp'),g('ResourceAuditIndex','resourceKey','timestamp')]),
 d('counters','counterId')
]);
export const M9_SCHEMA_BY_TABLE=new Map(M9_SCHEMA.map(t=>[t.tableName,t]));
export function validateSchema(){
 const errors=[];
 if(M9_SCHEMA.length!==18)errors.push('Schema must contain 18 tables');
 const names=new Set();
 for(const table of M9_SCHEMA){
  if(names.has(table.tableName))errors.push(`Duplicate table ${table.tableName}`);names.add(table.tableName);
  if(!table.partitionKey)errors.push(`Missing partition key: ${table.tableName}`);
  const gs=new Set();for(const i of table.indexes){if(gs.has(i.name))errors.push(`Duplicate GSI: ${table.tableName}/${i.name}`);gs.add(i.name);if(!i.partitionKey)errors.push(`Missing GSI PK: ${i.name}`);}
 }
 return errors;
}
