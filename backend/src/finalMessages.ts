/** Academy-scoped administrator chats and class-scoped teacher/student chats
 * on the existing notifications entity. No new table or index is required. */
import { createHash, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { entityTable } from './entityTables.mjs';
import { httpError } from './model.ts';
import type { Claims, InstitutionId } from './model.ts';
import { listMessageAdministrators } from './adminDirectory.ts';
import { ownProfilePhoto } from './profilePhotos.ts';

type Db = { send: (command: any) => Promise<any> };
type Person = Record<string, any>;
type AdminContact = { sub: string; displayName: string; photoUrl?: string };
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{4,150}$/.test(value);
const validInst = (value: unknown): value is InstitutionId =>
  value === 'raaga' || value === 'sruti';
const name = (person: Person) =>
  String(
    person.displayName || [person.firstName, person.lastName].filter(Boolean).join(' ') || '',
  ).trim();
const activeClass = (row: Person) =>
  row &&
  row.status !== 'archived' &&
  row.status !== 'inactive' &&
  row.status !== 'deleted' &&
  row.archived !== true;
const teacherIds = (teacher: Person): string[] =>
  [teacher.personId, teacher.teacherId, teacher.staffProfile?.teacherId, teacher.legacyPayload?.id]
    .filter(validId)
    .filter((id, index, all) => all.indexOf(id) === index);
const assignedTeacherId = (cls: Person, teacher: Person): string | undefined => {
  const assigned = [
    ...(Array.isArray(cls?.teacherPersonIds) ? cls.teacherPersonIds : []),
    cls?.teacherId,
    cls?.legacyPayload?.teacherId,
  ].filter(validId);
  return assigned.find((id) => teacherIds(teacher).includes(id));
};
const assignedTeacher = (cls: Person, teacher: Person) => !!assignedTeacherId(cls, teacher);
const threadKey = (institution: InstitutionId, classId: string, first: string, second: string) =>
  createHash('sha256')
    .update([institution, classId, ...[first, second].sort()].join('|'))
    .digest('hex');
const adminActorId = (sub: string) => `ADMIN-${createHash('sha256').update(sub).digest('hex')}`;
const adminClassId = (institution: InstitutionId) => `ACADEMY-${institution.toUpperCase()}`;
const adminClass = (institution: InstitutionId): Person => ({
  classId: adminClassId(institution),
  institutionId: institution,
  name: institution === 'raaga' ? 'Raagasudha' : 'Śruti Vedam',
  status: 'active',
});
const adminPerson = (institution: InstitutionId, record: AdminContact): Person => ({
  personId: adminActorId(record.sub),
  displayName: record.displayName || 'Academy Administrator',
  personTypes: ['administrator'],
  institutionIds: [institution],
  status: 'active',
  isAdminActor: true,
  adminSub: record.sub,
  photoUrl: record.photoUrl || '',
});
const unreadable = (message: string) => httpError(403, message);
let lastMessageTime = 0;
const messageTimestamp = () => {
  lastMessageTime = Math.max(Date.now(), lastMessageTime + 1);
  return new Date(lastMessageTime).toISOString();
};

export function makeFinalMessages(
  db: Db,
  listAdmins: (institution: InstitutionId) => Promise<AdminContact[]> = async () => [],
  photoForSub: (sub: string) => Promise<string> = ownProfilePhoto,
) {
  const table = (entity: string) => entityTable(entity);
  const get = async (entity: string, key: string, id: string): Promise<Person | null> =>
    (
      await db.send(
        new GetCommand({ TableName: table(entity), Key: { [key]: id }, ConsistentRead: true }),
      )
    ).Item ?? null;
  const queryAll = async (
    entity: string,
    index: string,
    key: string,
    value: string,
    limit = 3000,
  ): Promise<Person[]> => {
    let cursor: any;
    const rows: Person[] = [];
    do {
      const page = await db.send(
        new QueryCommand({
          TableName: table(entity),
          IndexName: index,
          KeyConditionExpression: '#key=:value',
          ExpressionAttributeNames: { '#key': key },
          ExpressionAttributeValues: { ':value': value },
          Limit: 100,
          ExclusiveStartKey: cursor,
        }),
      );
      rows.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > limit) throw httpError(413, 'Too many messaging records.');
    } while (cursor);
    return rows;
  };
  const scanPeople = async (limit = 5000): Promise<Person[]> => {
    let cursor: any;
    const rows: Person[] = [];
    do {
      const page = await db.send(
        new ScanCommand({
          TableName: table('people'),
          ConsistentRead: true,
          Limit: 100,
          ExclusiveStartKey: cursor,
        }),
      );
      rows.push(...(page.Items ?? []));
      cursor = page.LastEvaluatedKey;
      if (rows.length > limit)
        throw httpError(413, 'Too many academy people for messaging contacts.');
    } while (cursor);
    return rows;
  };
  async function actorFor(
    institution: InstitutionId,
    claims: Claims,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    if (!validId(claims?.sub)) throw httpError(401, 'Sign in to use messages.');
    if (adminInstitutions.includes(institution) && !actingStudentId)
      return {
        personId: adminActorId(claims.sub),
        cognitoSub: claims.sub,
        displayName: 'Academy Administrator',
        personTypes: ['administrator'],
        institutionIds: [institution],
        status: 'active',
        isAdminActor: true,
      };
    const matches = (
      await queryAll('people', 'CognitoIdentityIndex', 'cognitoSub', claims.sub, 50)
    ).filter((person) => person.cognitoSub === claims.sub && person.status === 'active');
    if (actingStudentId) {
      const direct = matches.filter(
        (person) =>
          person.personId === actingStudentId && person.institutionIds?.includes(institution),
      );
      if (direct.length === 1) {
        const fresh = await get('people', 'personId', actingStudentId);
        if (
          !fresh ||
          fresh.cognitoSub !== claims.sub ||
          fresh.status !== 'active' ||
          !fresh.institutionIds?.includes(institution) ||
          !fresh.personTypes?.includes('student')
        )
          throw httpError(403, 'Verified student account required.');
        return fresh;
      }
      const guardians = matches.filter((person) => person.personTypes?.includes('guardian'));
      if (guardians.length !== 1)
        throw httpError(403, 'Approved family access to this student is required.');
      const guardian = await get('people', 'personId', guardians[0].personId);
      const student = await get('people', 'personId', actingStudentId);
      // The approved academy-scoped family link authorizes the guardian to act as
      // this child; the guardian need not separately belong to the child's academy.
      if (
        !guardian ||
        guardian.cognitoSub !== claims.sub ||
        guardian.status !== 'active' ||
        !guardian.personTypes?.includes('guardian') ||
        !student ||
        student.status !== 'active' ||
        !student.personTypes?.includes('student') ||
        !student.institutionIds?.includes(institution) ||
        !validId(student.familyId) ||
        !validId(guardian.familyId) ||
        typeof student.studentProfile?.rollNumbers?.[institution] !== 'string' ||
        !student.studentProfile.rollNumbers[institution].trim()
      )
        throw httpError(403, 'Approved family access to this student is required.');
      const candidates = await queryAll(
        'family-links',
        'GuardianAccessIndex',
        'guardianPersonId',
        guardian.personId,
        200,
      );
      let approvedLink: Person | null = null;
      for (const candidate of candidates) {
        if (
          !validId(candidate.linkId) ||
          candidate.studentId !== student.personId ||
          candidate.institutionId !== institution
        )
          continue;
        const link = await get('family-links', 'linkId', candidate.linkId);
        if (
          link &&
          link.guardianPersonId === guardian.personId &&
          link.studentId === student.personId &&
          link.institutionId === institution &&
          link.familyId === student.familyId &&
          (link.guardianFamilyId || link.familyId) === guardian.familyId &&
          link.accessStatus === 'approved' &&
          link.relationshipVerified === true
        ) {
          approvedLink = link;
          break;
        }
      }
      if (!approvedLink)
        throw httpError(403, 'Approved family access to this student is required.');
      return {
        ...student,
        __messageProxy: {
          guardianPersonId: guardian.personId,
          linkId: approvedLink.linkId,
          familyId: student.familyId,
          guardianFamilyId: guardian.familyId,
        },
      };
    }
    const scoped = matches.filter((person) => person.institutionIds?.includes(institution));
    if (scoped.length !== 1)
      throw httpError(scoped.length > 1 ? 409 : 403, 'Verified academy account required.');
    const fresh = await get('people', 'personId', scoped[0].personId);
    if (
      !fresh ||
      fresh.cognitoSub !== claims.sub ||
      fresh.status !== 'active' ||
      !fresh.institutionIds?.includes(institution)
    )
      throw httpError(403, 'Verified academy account required.');
    const roles = Array.isArray(fresh.personTypes) ? fresh.personTypes : [];
    if (!roles.includes('teacher') && !roles.includes('student') && !roles.includes('guardian'))
      throw unreadable(
        'Messages are available to administrators, teachers, students and guardians.',
      );
    return fresh;
  }
  function addActorConditions(
    conditions: any[],
    actor: Person,
    claims: Claims,
    institution: InstitutionId,
  ) {
    if (actor.__messageProxy) {
      const proxy = actor.__messageProxy;
      conditions.push(
        {
          ConditionCheck: {
            TableName: table('people'),
            Key: { personId: proxy.guardianPersonId },
            ConditionExpression:
              '#status=:active AND cognitoSub=:subject AND contains(personTypes,:guardian) AND familyId=:guardianFamily',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':active': 'active',
              ':subject': claims.sub,
              ':guardian': 'guardian',
              ':guardianFamily': proxy.guardianFamilyId,
            },
          },
        },
        {
          ConditionCheck: {
            TableName: table('people'),
            Key: { personId: actor.personId },
            ConditionExpression:
              '#status=:active AND contains(institutionIds,:inst) AND contains(personTypes,:student) AND familyId=:family',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':active': 'active',
              ':inst': institution,
              ':student': 'student',
              ':family': proxy.familyId,
            },
          },
        },
        {
          ConditionCheck: {
            TableName: table('family-links'),
            Key: { linkId: proxy.linkId },
            ConditionExpression:
              'guardianPersonId=:guardian AND studentId=:student AND institutionId=:inst AND familyId=:family AND (guardianFamilyId=:guardianFamily OR attribute_not_exists(guardianFamilyId)) AND accessStatus=:approved AND relationshipVerified=:verified',
            ExpressionAttributeValues: {
              ':guardian': proxy.guardianPersonId,
              ':student': actor.personId,
              ':inst': institution,
              ':family': proxy.familyId,
              ':guardianFamily': proxy.guardianFamilyId,
              ':approved': 'approved',
              ':verified': true,
            },
          },
        },
      );
    } else if (!actor.isAdminActor) {
      conditions.push({
        ConditionCheck: {
          TableName: table('people'),
          Key: { personId: actor.personId },
          ConditionExpression:
            '#status=:active AND cognitoSub=:subject AND contains(institutionIds,:inst)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':active': 'active',
            ':subject': claims.sub,
            ':inst': institution,
          },
        },
      });
    }
  }
  async function activeEnrolments(institution: InstitutionId, studentId: string) {
    const candidates = await queryAll(
      'enrolments',
      'StudentEnrolmentsIndex',
      'studentId',
      studentId,
      200,
    );
    const fresh = await Promise.all(
      candidates
        .filter((row) => validId(row.enrolmentId))
        .map((row) => get('enrolments', 'enrolmentId', row.enrolmentId)),
    );
    return fresh.filter(
      (row): row is Person =>
        !!row &&
        row.studentId === studentId &&
        row.institutionId === institution &&
        row.status === 'active' &&
        row.archived !== true,
    );
  }
  async function allowedPair(
    institution: InstitutionId,
    actor: Person,
    peerId: string,
    classId: string,
  ) {
    if (!validId(peerId) || !validId(classId))
      throw httpError(400, 'Choose a valid class and conversation partner.');
    if (peerId === actor.personId)
      throw httpError(400, 'You cannot start a conversation with yourself.');
    const academyThread = classId === adminClassId(institution);
    if (peerId.startsWith('ADMIN-')) {
      const admin = (await listAdmins(institution)).find(
        (item) => adminActorId(item.sub) === peerId,
      );
      if (!admin || !academyThread) throw httpError(404, 'Academy administrator not found.');
      const prior = actor.isAdminActor ? [] : await messagesFor(institution, actor);
      const evidence = prior.find(
        (row) =>
          row.otherPersonId === peerId &&
          row.classId === classId &&
          row.adminActor === true &&
          row.threadId === threadKey(institution, classId, actor.personId, peerId),
      );
      const canStart =
        actor.isAdminActor ||
        actor.personTypes?.includes('teacher') ||
        actor.personTypes?.includes('student');
      if (!canStart && !evidence)
        throw unreadable(
          'Only teachers, students and administrators can start an academy-admin conversation.',
        );
      const peer = adminPerson(institution, admin),
        cls = adminClass(institution);
      return {
        peer,
        teacher: null,
        student: null,
        cls,
        membership: null,
        threadId: threadKey(institution, classId, actor.personId, peerId),
        adminPair: true,
        adminRecipient: true,
        evidence,
        adminSub: admin.sub,
      };
    }
    const peer = await get('people', 'personId', peerId),
      cls: Person | null = academyThread
        ? adminClass(institution)
        : await get('classes', 'classId', classId);
    if (actor.isAdminActor) {
      if (
        !peer ||
        peer.status !== 'active' ||
        !validId(peer.personId) ||
        !peer.institutionIds?.includes(institution) ||
        !cls ||
        (!academyThread && (!activeClass(cls) || cls.institutionId !== institution))
      )
        throw httpError(404, 'Academy contact not found.');
      if (academyThread) {
        if (!['teacher', 'student', 'guardian'].some((role) => peer.personTypes?.includes(role)))
          throw httpError(404, 'Academy contact not found.');
        return {
          peer,
          teacher: null,
          student: null,
          cls,
          membership: null,
          familyLink: null,
          threadId: threadKey(institution, classId, actor.personId, peer.personId),
          adminPair: true,
        };
      }
      let membership: Person | null = null,
        familyLink: Person | null = null,
        assignedTeacherKey: string | undefined;
      if (peer.personTypes?.includes('student'))
        membership =
          (await activeEnrolments(institution, peer.personId)).find(
            (row) => row.classId === classId,
          ) ?? null;
      else if (peer.personTypes?.includes('teacher')) {
        assignedTeacherKey = assignedTeacherId(cls, peer);
        if (!assignedTeacherKey) throw httpError(404, 'Academy contact not found.');
      } else if (peer.personTypes?.includes('guardian')) {
        const candidates = await queryAll(
          'family-links',
          'GuardianAccessIndex',
          'guardianPersonId',
          peer.personId,
          200,
        );
        for (const candidate of candidates) {
          if (
            !validId(candidate.linkId) ||
            candidate.institutionId !== institution ||
            !validId(candidate.studentId)
          )
            continue;
          const link = await get('family-links', 'linkId', candidate.linkId);
          if (
            !link ||
            link.guardianPersonId !== peer.personId ||
            link.studentId !== candidate.studentId ||
            link.institutionId !== institution ||
            link.accessStatus !== 'approved' ||
            link.relationshipVerified !== true ||
            (link.guardianFamilyId || link.familyId) !== peer.familyId
          )
            continue;
          const student = await get('people', 'personId', link.studentId);
          if (
            !student ||
            student.status !== 'active' ||
            !student.institutionIds?.includes(institution) ||
            student.familyId !== link.familyId
          )
            continue;
          membership =
            (await activeEnrolments(institution, student.personId)).find(
              (row) => row.classId === classId,
            ) ?? null;
          if (membership) {
            familyLink = link;
            break;
          }
        }
      }
      if (
        (peer.personTypes?.includes('student') || peer.personTypes?.includes('guardian')) &&
        !membership
      )
        throw httpError(404, 'Academy contact is no longer linked to an active class.');
      return {
        peer,
        teacher: null,
        student: null,
        cls,
        membership,
        familyLink,
        assignedTeacherKey,
        threadId: threadKey(institution, classId, actor.personId, peer.personId),
        adminPair: true,
      };
    }
    if (
      !peer ||
      peer.status !== 'active' ||
      !validId(peer.personId) ||
      !peer.institutionIds?.includes(institution) ||
      !activeClass(cls) ||
      cls.institutionId !== institution
    )
      throw httpError(404, 'Class or conversation partner not found.');
    const actorIsTeacher = actor.personTypes?.includes('teacher') === true;
    const actorIsStudent = actor.personTypes?.includes('student') === true;
    const peerIsTeacher = peer.personTypes?.includes('teacher') === true;
    const peerIsStudent = peer.personTypes?.includes('student') === true;
    if (
      actorIsTeacher === peerIsTeacher ||
      actorIsStudent === peerIsStudent ||
      (!actorIsTeacher && !actorIsStudent) ||
      (!peerIsTeacher && !peerIsStudent)
    )
      throw unreadable('Messages are limited to a teacher and an enrolled student.');
    if (actorIsStudent && !validId(peer.cognitoSub))
      throw httpError(404, 'Teacher account is not linked for messaging.');
    const teacher = actorIsTeacher ? actor : peer,
      student = actorIsStudent ? actor : peer;
    const assignedTeacherKey = assignedTeacherId(cls, teacher);
    if (!assignedTeacherKey)
      throw unreadable('Only the class teacher can access this conversation.');
    const memberships = await activeEnrolments(institution, student.personId);
    const membership = memberships.find((row) => row.classId === classId);
    if (!membership) throw unreadable('The student is not actively enrolled in this class.');
    return {
      peer,
      teacher,
      student,
      cls,
      membership,
      assignedTeacherKey,
      threadId: threadKey(institution, classId, teacher.personId, student.personId),
    };
  }
  async function messagesFor(institution: InstitutionId, actor: Person, threadId?: string) {
    const rows = await queryAll(
      'notifications',
      'RecipientNotificationsIndex',
      'recipientPersonId',
      actor.personId,
      5000,
    );
    const own = rows.filter(
      (row) =>
        row.recordType === 'direct-message' &&
        row.institutionId === institution &&
        row.recipientPersonId === actor.personId &&
        (!threadId || row.threadId === threadId),
    );
    return own.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  const publicContact = async (peer: Person, cls: Person, threadId: string) => ({
    peerId: peer.personId,
    peerName: name(peer) || 'Sadhana user',
    peerRole:
      peer.isAdminActor || peer.personTypes?.includes('administrator')
        ? 'admin'
        : peer.personTypes?.includes('teacher')
          ? 'teacher'
          : peer.personTypes?.includes('student')
            ? 'student'
            : 'guardian',
    classId: cls.classId,
    className: String(cls.name || cls.legacyPayload?.name || 'Class'),
    threadId,
    photoUrl:
      peer.photoUrl ||
      (typeof peer.cognitoSub === 'string' && /^[a-f0-9-]{36}$/i.test(peer.cognitoSub)
        ? await photoForSub(peer.cognitoSub)
        : ''),
  });
  async function contacts(
    institution: InstitutionId,
    claims: Claims,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    const actor = await actorFor(institution, claims, adminInstitutions, actingStudentId),
      out: Person[] = [];
    if (actor.isAdminActor) {
      const cls = adminClass(institution),
        peopleById = new Map<string, Person>();
      for (const candidate of await scanPeople())
        if (
          candidate.status === 'active' &&
          validId(candidate.personId) &&
          candidate.institutionIds?.includes(institution) &&
          ['teacher', 'student', 'guardian'].some((role) => candidate.personTypes?.includes(role))
        )
          peopleById.set(candidate.personId, candidate);
      for (const peer of peopleById.values()) out.push({ ...peer, __class: cls });
    } else if (actor.personTypes?.includes('student')) {
      const enrolments = await activeEnrolments(institution, actor.personId);
      for (const enrolment of enrolments) {
        const cls = await get('classes', 'classId', enrolment.classId);
        if (!activeClass(cls) || cls.institutionId !== institution) continue;
        const assignedIds = new Set(
          [
            ...(Array.isArray(cls.teacherPersonIds) ? cls.teacherPersonIds : []),
            cls.teacherId,
            cls.legacyPayload?.teacherId,
          ].filter(validId),
        );
        const indexedTeachers = await queryAll(
          'people',
          'PersonTypeIndex',
          'directoryGroup',
          'teacher',
          3000,
        );
        for (const id of assignedIds) {
          const direct = await get('people', 'personId', id);
          const candidates = [...(direct ? [direct] : []), ...indexedTeachers];
          for (const peer of candidates) {
            if (
              peer?.status === 'active' &&
              validId(peer.cognitoSub) &&
              peer.institutionIds?.includes(institution) &&
              peer.personTypes?.includes('teacher') &&
              teacherIds(peer).includes(id)
            )
              out.push({ ...peer, __class: cls });
          }
        }
      }
    } else {
      if (actor.personTypes?.includes('guardian')) {
        const rows = await messagesFor(institution, actor);
        for (const row of rows) {
          if (
            row.adminActor !== true ||
            !row.otherPersonId?.startsWith('ADMIN-') ||
            row.classId !== adminClassId(institution)
          )
            continue;
          const cls = adminClass(institution);
          out.push({
            personId: row.otherPersonId,
            displayName: 'Academy Administrator',
            personTypes: ['administrator'],
            institutionIds: [institution],
            status: 'active',
            isAdminActor: true,
            __class: cls,
          });
        }
      }
      const classes = await queryAll(
        'classes',
        'InstitutionClassesIndex',
        'institutionId',
        institution,
        1000,
      );
      for (const candidate of classes.filter(
        (row) => assignedTeacher(row, actor) && activeClass(row),
      )) {
        const cls = await get('classes', 'classId', candidate.classId);
        if (!activeClass(cls) || cls.institutionId !== institution || !assignedTeacher(cls, actor))
          continue;
        const enrolments = await queryAll(
          'enrolments',
          'ClassEnrolmentsIndex',
          'classId',
          cls.classId,
          1000,
        );
        for (const candidateEnrolment of enrolments.filter(
          (row) => row.status === 'active' && row.archived !== true,
        )) {
          if (!validId(candidateEnrolment.studentId)) continue;
          const [membership, peer] = await Promise.all([
            get('enrolments', 'enrolmentId', candidateEnrolment.enrolmentId),
            get('people', 'personId', candidateEnrolment.studentId),
          ]);
          if (
            membership?.institutionId === institution &&
            membership.status === 'active' &&
            membership.archived !== true &&
            peer?.status === 'active' &&
            validId(peer.personId) &&
            peer.institutionIds?.includes(institution) &&
            peer.personTypes?.includes('student')
          )
            out.push({ ...peer, __class: cls });
        }
      }
    }
    if (
      actor.isAdminActor ||
      actor.personTypes?.includes('teacher') ||
      actor.personTypes?.includes('student')
    ) {
      for (const admin of await listAdmins(institution))
        if (!actor.isAdminActor || admin.sub !== claims.sub)
          out.push({ ...adminPerson(institution, admin), __class: adminClass(institution) });
    }
    const unique = new Map<string, any>();
    for (const peer of out) {
      const cls = peer.__class,
        threadId = threadKey(institution, cls.classId, actor.personId, peer.personId),
        record = await publicContact(peer, cls, threadId);
      unique.set(`${record.peerId}|${record.classId}`, record);
    }
    return {
      records: [...unique.values()].sort(
        (a, b) => a.peerName.localeCompare(b.peerName) || a.className.localeCompare(b.className),
      ),
    };
  }
  async function thread(
    institution: InstitutionId,
    claims: Claims,
    peerId: string,
    classId: string,
    requestedThreadId: string,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    const actor = await actorFor(institution, claims, adminInstitutions, actingStudentId),
      pair = await allowedPair(institution, actor, peerId, classId);
    if (pair.threadId !== requestedThreadId) throw httpError(404, 'Conversation not found.');
    const rows = await messagesFor(institution, actor, pair.threadId);
    return {
      actor,
      pair,
      records: rows
        .slice(0, 100)
        .reverse()
        .map((row) => ({
          id: row.messageId,
          senderId: row.senderPersonId,
          recipientId: row.otherPersonId,
          text: row.messageText,
          createdAt: row.createdAt,
          read: row.read === true,
        })),
    };
  }
  async function threads(
    institution: InstitutionId,
    claims: Claims,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    const actor = await actorFor(institution, claims, adminInstitutions, actingStudentId),
      rows = await messagesFor(institution, actor),
      groups = new Map<string, Person[]>();
    for (const row of rows) {
      if (!validId(row.otherPersonId) || !validId(row.classId) || !validId(row.threadId)) continue;
      const list = groups.get(row.threadId) || [];
      list.push(row);
      groups.set(row.threadId, list);
    }
    const records = [];
    for (const [threadId, items] of groups) {
      const last = items[0];
      try {
        const pair = await allowedPair(institution, actor, last.otherPersonId, last.classId);
        if (pair.threadId !== threadId) continue;
        records.push({
          ...(await publicContact(pair.peer, pair.cls, threadId)),
          lastMessage: last.messageText,
          lastAt: last.createdAt,
          unreadCount: items.filter(
            (item) => item.read !== true && item.senderPersonId !== actor.personId,
          ).length,
        });
      } catch (error: any) {
        if (error?.status === 403 || error?.status === 404) continue;
        throw error;
      }
    }
    return {
      records: records
        .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
        .slice(0, 100),
    };
  }
  async function learnerNotifications(
    institution: InstitutionId,
    claims: Claims,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    const actor = await actorFor(institution, claims, adminInstitutions, actingStudentId);
    if (
      actor.isAdminActor ||
      (!actor.personTypes?.includes('student') && !actor.personTypes?.includes('guardian'))
    )
      throw httpError(
        403,
        'Learner notifications are available to students and their approved families.',
      );
    const rows = await queryAll(
      'notifications',
      'RecipientNotificationsIndex',
      'recipientPersonId',
      actor.personId,
      5000,
    );
    return {
      records: rows
        .filter(
          (row) =>
            row.recordType === 'learner-activity' &&
            row.institutionId === institution &&
            row.recipientPersonId === actor.personId,
        )
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 100)
        .map((row) => ({
          id: row.notificationId,
          institution,
          title: row.title,
          detail: row.detail,
          category: row.category,
          age: row.createdAt,
          read: row.read === true,
          activityId: row.resourceId,
        })),
    };
  }
  async function markLearnerNotificationRead(
    institution: InstitutionId,
    claims: Claims,
    notificationId: string,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    const actor = await actorFor(institution, claims, adminInstitutions, actingStudentId);
    if (
      actor.isAdminActor ||
      (!actor.personTypes?.includes('student') && !actor.personTypes?.includes('guardian'))
    )
      throw httpError(
        403,
        'Learner notifications are available to students and their approved families.',
      );
    const rows = await queryAll(
      'notifications',
      'RecipientNotificationsIndex',
      'recipientPersonId',
      actor.personId,
      5000,
    );
    const row = rows.find(
      (item) =>
        item.notificationId === notificationId &&
        item.recordType === 'learner-activity' &&
        item.institutionId === institution,
    );
    if (!row) return { updated: 0 };
    await db.send(
      new UpdateCommand({
        TableName: table('notifications'),
        Key: { notificationId },
        UpdateExpression: 'SET #read=:yes,readAt=:now',
        ConditionExpression:
          'recordType=:type AND institutionId=:inst AND recipientPersonId=:recipient',
        ExpressionAttributeNames: { '#read': 'read' },
        ExpressionAttributeValues: {
          ':yes': true,
          ':now': new Date().toISOString(),
          ':type': 'learner-activity',
          ':inst': institution,
          ':recipient': actor.personId,
        },
      }),
    );
    return { updated: 1 };
  }
  async function send(
    institution: InstitutionId,
    claims: Claims,
    peerId: string,
    classId: string,
    threadId: string | undefined,
    body: unknown,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'text')
    )
      throw httpError(400, 'Enter a message.');
    const text = typeof (body as any).text === 'string' ? (body as any).text.trim() : '';
    if (!text || text.length > 200) throw httpError(400, 'Messages must be 1–200 characters.');
    const actor = await actorFor(institution, claims, adminInstitutions, actingStudentId),
      pair = await allowedPair(institution, actor, peerId, classId);
    if (threadId && pair.threadId !== threadId) throw httpError(404, 'Conversation not found.');
    const messageId = `MESSAGE-${randomUUID()}`,
      now = messageTimestamp(),
      actorCopy = `NOTIFICATION-${randomUUID()}`,
      peerCopy = `NOTIFICATION-${randomUUID()}`;
    const recipient = pair.peer;
    const record = (
      recipientPersonId: string,
      otherPersonId: string,
      read: boolean,
      notificationId: string,
    ) => ({
      notificationId,
      recordType: 'direct-message',
      institutionId: institution,
      recipientPersonId,
      otherPersonId,
      senderPersonId: actor.personId,
      threadId: pair.threadId,
      classId,
      className: String(pair.cls.name || pair.cls.legacyPayload?.name || 'Class'),
      messageId,
      messageText: text,
      createdAt: now,
      read,
      ...(actor.isAdminActor || pair.adminPair ? { adminActor: true } : {}),
      ...(read ? { readAt: now } : {}),
    });
    const audit = {
      auditId: `AUDIT-${randomUUID()}`,
      institutionId: institution,
      action: 'directMessageSent',
      actorPersonId: actor.__messageProxy?.guardianPersonId ?? actor.personId,
      ...(actor.__messageProxy ? { representedStudentId: actor.personId } : {}),
      recipientPersonId: recipient.personId,
      resourceType: 'message',
      resourceId: messageId,
      classId,
      timestamp: now,
    };
    const conditions: any[] = [];
    if (actor.isAdminActor && !pair.adminRecipient) {
      conditions.push({
        ConditionCheck: {
          TableName: table('people'),
          Key: { personId: recipient.personId },
          ConditionExpression: '#status=:active AND contains(institutionIds,:inst)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':active': 'active', ':inst': institution },
        },
      });
      if (classId !== adminClassId(institution))
        conditions.push({
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId },
            ConditionExpression: `institutionId=:inst AND #status=:active${pair.peer.personTypes?.includes('teacher') ? ' AND (contains(teacherPersonIds,:teacher) OR teacherId=:teacher OR #legacy.#teacherId=:teacher)' : ''}`,
            ExpressionAttributeNames: {
              '#status': 'status',
              ...(pair.peer.personTypes?.includes('teacher')
                ? { '#legacy': 'legacyPayload', '#teacherId': 'teacherId' }
                : {}),
            },
            ExpressionAttributeValues: {
              ':inst': institution,
              ':active': pair.cls.status || 'active',
              ...(pair.peer.personTypes?.includes('teacher')
                ? { ':teacher': pair.assignedTeacherKey }
                : {}),
            },
          },
        });
      if (pair.membership)
        conditions.push({
          ConditionCheck: {
            TableName: table('enrolments'),
            Key: { enrolmentId: pair.membership.enrolmentId },
            ConditionExpression:
              'institutionId=:inst AND classId=:class AND #status=:active AND (attribute_not_exists(archived) OR archived=:no)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':inst': institution,
              ':class': classId,
              ':active': 'active',
              ':no': false,
            },
          },
        });
      if (pair.familyLink)
        conditions.push({
          ConditionCheck: {
            TableName: table('family-links'),
            Key: { linkId: pair.familyLink.linkId },
            ConditionExpression:
              'institutionId=:inst AND guardianPersonId=:guardian AND studentId=:student AND familyId=:family AND accessStatus=:approved AND relationshipVerified=:verified',
            ExpressionAttributeValues: {
              ':inst': institution,
              ':guardian': recipient.personId,
              ':student': pair.familyLink.studentId,
              ':family': pair.familyLink.familyId,
              ':approved': 'approved',
              ':verified': true,
            },
          },
        });
    } else if (actor.isAdminActor && pair.adminRecipient) {
      // The recipient was resolved from the institution's authoritative Cognito admin group.
    } else if (pair.adminPair) {
      addActorConditions(conditions, actor, claims, institution);
      if (pair.evidence)
        conditions.push({
          ConditionCheck: {
            TableName: table('notifications'),
            Key: { notificationId: pair.evidence.notificationId },
            ConditionExpression:
              'recordType=:type AND institutionId=:inst AND recipientPersonId=:recipient AND otherPersonId=:admin AND adminActor=:yes',
            ExpressionAttributeValues: {
              ':type': 'direct-message',
              ':inst': institution,
              ':recipient': actor.personId,
              ':admin': peerId,
              ':yes': true,
            },
          },
        });
    } else {
      conditions.push(
        {
          ConditionCheck: {
            TableName: table('people'),
            Key: { personId: recipient.personId },
            ConditionExpression: '#status=:active AND contains(institutionIds,:inst)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':active': 'active', ':inst': institution },
          },
        },
        {
          ConditionCheck: {
            TableName: table('classes'),
            Key: { classId },
            ConditionExpression:
              'institutionId=:inst AND #status=:active AND (contains(teacherPersonIds,:teacher) OR teacherId=:teacher OR #legacy.#teacherId=:teacher)',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#legacy': 'legacyPayload',
              '#teacherId': 'teacherId',
            },
            ExpressionAttributeValues: {
              ':inst': institution,
              ':teacher': pair.assignedTeacherKey,
              ':active': pair.cls.status || 'active',
            },
          },
        },
        {
          ConditionCheck: {
            TableName: table('enrolments'),
            Key: { enrolmentId: pair.membership.enrolmentId },
            ConditionExpression:
              'institutionId=:inst AND studentId=:student AND classId=:class AND #status=:active AND (attribute_not_exists(archived) OR archived=:no)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':inst': institution,
              ':student': pair.student.personId,
              ':class': classId,
              ':active': 'active',
              ':no': false,
            },
          },
        },
      );
      addActorConditions(conditions, actor, claims, institution);
    }
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: [
            ...conditions,
            {
              Put: {
                TableName: table('notifications'),
                Item: record(actor.personId, recipient.personId, true, actorCopy),
                ConditionExpression: 'attribute_not_exists(notificationId)',
              },
            },
            {
              Put: {
                TableName: table('notifications'),
                Item: record(recipient.personId, actor.personId, false, peerCopy),
                ConditionExpression: 'attribute_not_exists(notificationId)',
              },
            },
            {
              Put: {
                TableName: table('audit'),
                Item: audit,
                ConditionExpression: 'attribute_not_exists(auditId)',
              },
            },
          ],
        }),
      );
    } catch (error: any) {
      if (['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(error?.name))
        throw httpError(409, 'Conversation access changed. Refresh before sending.');
      throw error;
    }
    return {
      record: {
        id: messageId,
        threadId: pair.threadId,
        senderId: actor.personId,
        recipientId: recipient.personId,
        text,
        createdAt: now,
        read: true,
      },
    };
  }
  async function markRead(
    institution: InstitutionId,
    claims: Claims,
    peerId: string,
    classId: string,
    threadId: string,
    adminInstitutions: InstitutionId[] = [],
    actingStudentId?: string,
  ) {
    const { actor, pair, records } = await thread(
      institution,
      claims,
      peerId,
      classId,
      threadId,
      adminInstitutions,
      actingStudentId,
    );
    const all = await messagesFor(institution, actor, threadId);
    const unread = all.filter(
      (row) =>
        row.otherPersonId === peerId &&
        row.classId === classId &&
        row.read !== true &&
        row.senderPersonId === peerId,
    );
    const now = new Date().toISOString();
    for (const row of unread) {
      await db.send(
        new UpdateCommand({
          TableName: table('notifications'),
          Key: { notificationId: row.notificationId },
          UpdateExpression: 'SET #read=:yes,readAt=:now',
          ConditionExpression:
            'recordType=:type AND institutionId=:inst AND recipientPersonId=:recipient AND #read=:no',
          ExpressionAttributeNames: { '#read': 'read' },
          ExpressionAttributeValues: {
            ':yes': true,
            ':no': false,
            ':now': now,
            ':type': 'direct-message',
            ':inst': institution,
            ':recipient': actor.personId,
          },
        }),
      );
    }
    return { updated: unread.length, records };
  }
  return {
    contacts,
    threads,
    thread,
    send,
    markRead,
    learnerNotifications,
    markLearnerNotificationRead,
  };
}
let singleton: ReturnType<typeof makeFinalMessages> | undefined;
export function finalMessages() {
  return (singleton ??= makeFinalMessages(
    DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }),
      { marshallOptions: { removeUndefinedValues: true } },
    ),
    listMessageAdministrators,
  ));
}
