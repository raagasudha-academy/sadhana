# Sadhana v0.5 — DynamoDB data design (foundation)

**Status:** Implemented as source code and infrastructure template, **not deployed**. The v0.4 React frontend remains a temporary fictional-data demo while secure sign-in is configured. No actual families, students, or WhatsApp services have been migrated or connected.

## Why a protected API?

The browser must never have DynamoDB keys or an IAM role able to read student records. Only the backend Lambda has DynamoDB permissions. Amazon API Gateway validates a Cognito staff JWT; the Lambda checks institution-level admin group membership on **every** request. A client-selected `persona`, workspace, or role is never accepted as proof of permission.

### Database shape

One DynamoDB table (`sadhana-<stage>-main`) stores shared identities plus institution-scoped records. Key format:

| Record type | Primary `PK` | `SK` | GSI1 lookup | GSI2 lookup |
|---|---|---|---|---|
| Family | `FAMILY#<FamilyID>` | `META` | family directory by name | exact phone |
| Student | `STUDENT#<StudentID>` | `META` | student directory by name | optional own phone |
| Class | `CLASS#<ClassID>` | `META` | `INST#<institution>#CLASS` | — |
| Venue | `VENUE#<VenueID>` | `META` | central directory | — |
| Enrolment | `ENROLMENT#<EnrolmentID>` | `META` | `INST#<institution>#ENROLMENT` | `CLASS#<classId>` |
| Practice entry | `PRACTICE#<institution>#<StudentID>` | `DATE#<YYYY-MM-DD>` | `INST#<institution>#PRACTICE` | — |
| Audit | `AUDIT#<institution>` | `AT#<ISO timestamp>#<unique>` | — | — |

Indices `GSI1` and `GSI2` have composite partition/sort keys, using the exact attribute names `GSI1PK`, `GSI1SK`, `GSI2PK`, `GSI2SK`. Public IDs use UUIDs so creation doesn't require central counters. Historical Google Sheet identifiers need a **reviewed mapping** before import.

### Shared identity without shared academic records

`Family` and `Student` identities are global, with `visibleIn` listing institutions in which the record has been registered/linked. Registering a student at the second academy links to their existing ID. An institution admin may search for possible matches, but search results reveal only a name/ID and limited phone context; other-institution class and academic records are not returned. All practice and enrolment records are tagged by institution and separately authorised.

### Access patterns in v0.5

1. List classes and enrolments for an authorised institution.
2. List families/students belonging to an authorised institution.
3. Search minimal shared identities by a name prefix (at least three characters).
4. Retrieve one student's UK-calendar practice history for an authorised institution.
5. Create/modify registrations, classes and enrolments with server-side validation.
6. Add, correct or void practice entries, preserving original values in audited events.
7. Read institution-specific administrative audit entries.

The backend requires a verified Cognito token carrying `raagasudha-admin` and/or `sruti-admin` group membership. Separate teacher/student scopes, self-service login, permission assignment, parental-consent periods and database-backed UI flows come after Cognito is configured. **Do not put real data into Sadhana until these are fully tested.**

### Integrity and retention

- Uses conditional transactional writes for changes and audit events. If a record version differs, the request is refused (`409 Conflict`).
- Practice uses one unique key for `(institution, Student ID, practice date)` and cannot be duplicated.
- Backdated practice entries require a reason and an enrolment valid on that date.
- Voids preserve data for audit but change the practice status so reporting excludes the entry.
- Deletion endpoints are intentionally disabled in the protected API pending archival, retention, dependency checks and full role design. **v0.4's demo delete buttons are not connected to DynamoDB.**
- API responses use `Cache-Control: no-store`; DynamoDB encryption at rest is enabled. Point-in-time recovery is disabled by default for the fictional-data dev stack to reduce costs; enable backups and test restore procedures before production.
- Table has deletion protection and CloudFormation `Retain`; no sample/student data seeding is performed by the deploy template.

### Important work still to complete before going live

- Set up Cognito invitation-only staff access, MFA, and role-to-class mapping. User-set `persona` must be removed from real mode.
- Implement teacher and student APIs and their permissions; at present the backend is admin-only.
- Build the secure login flow and call `src/api/sadhanaClient.ts` from the React UI. The UI remains **demo-only** until then.
- Implement soft-deletion/archive workflows including consent, enrolment deactivation and retention policy.
- Extend domain model for institution-specific consent, reminders, timetable exceptions, holidays, RSVP, teacher notes and messaging audit.
- Handle report periods and opt-in activation intervals on the server, not from the simplified demo assumptions.
- Add API pagination, filters and rate limiting before large-scale imports. Initial list responses are bounded; `more: true` flags incomplete pages.
- Add an approved backup/restoration procedure, production monitoring, AWS IAM controls and deployment/release review.
- Ensure UK GDPR privacy documentation and legal bases are reviewed for the real stored data.

## Environment separation

Use separate `dev`, `staging` and `prod` stacks. Begin with a *dev* table and fictional records. Do not connect or change your live Charu WhatsApp bot, Raagasudha website or Śruti Vedam website during this phase.

**No AWS credentials, secrets, consent records or real student data belong in the source ZIP.**
