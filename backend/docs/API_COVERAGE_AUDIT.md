# Sadhana API coverage audit — working inventory

Updated 8 November 2026. This remains a working audit, not a claim that all 158 inventoried endpoints are fully tested.

## Evidence and scope

`api-coverage-audit.csv` contains 158 distinct method + route-pattern rows: the 150 expanded entries from handover section 5 plus four source-discovered `m10-academy` writes and four public Sruti intake methods (`POST`/`OPTIONS` at `/` and `/register`) found in `infra/sruti-public-intake.yml`. The public intake rows describe local infrastructure source only; deployment must be checked against AWS before using them as live contracts.

The matrix separates evidence from assumptions. All 158 method/path rows now have a route-execution disposition: tested, source-inspected, blocked, retired, or live-verified. A disposition does not imply full category coverage or deployed/live verification. Candidate handler and test filenames are leads, not proof. The matrix deliberately does not calculate a coverage percentage from test counts.

## Live calendar gate now closed

- `GET /schedule/teacher-links?institution=sruti`: returned HTTP 200 in the signed-in Sruti admin timetable editor.
- `POST /additional-sessions?institution=sruti`: returned HTTP 201 for one synthetic, future session on Sruti’s empty-roster Vedic Chanting — Children Group 1 class. The session was then permanently deleted through the admin UI; calendar total and class session count returned to their original values.
- The create failure was traced to canonical class records having `recordType` only in `legacyPayload`; the final writer now accepts that valid shape while still requiring `recordType === 'class'`. Regression coverage includes route dispatch, canonical write/audit shape, and the deployed UI flow.

## Current code and deployment evidence

- Branch: `refactor/modular-architecture`
- Calendar fix commit: `9433319` (`fix calendar additional session routing`)
- Lambda: `sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh`, region `us-east-1`
- Code SHA: `2ItsOn7gfSNGyEg56B5qgnXKgFFSqMg8J2/q4LwDWv4=`; state `Active`, update `Successful`; final data mode and table set preserved.
- Verification: backend typecheck/build; 347 TypeScript tests; 457 MJS tests; live calendar reads/create/delete.

## Immediate audit sequence

1. Fill behavioral categories in priority order: expected status/contract, input validation, authentication/role, academy isolation, missing resource/version conflict, writes/audit, idempotence and sensitive-data projection.
2. Add direct handler/service tests where the matrix says source-inspected or mocked-only; prioritize P0 writes and security boundaries.
3. Map canonical writer/DynamoDB adapter effects and audit rows for family/student/enrolment mutations; preserve fail-closed unsupported routes.
4. Design/document the not-yet-specified student/family deactivation workflows before adding or enabling APIs.
5. Run the complete backend TypeScript and MJS suites after each test batch.
6. Commit audit/test changes in small local increments; begin Playwright after API contracts and behavioral coverage gaps are closed.

## Current known limitations

- The matrix inventory is not yet exhaustive for every path discovered by a full static dispatch walk; it includes the handover baseline plus the source additions above. Continue expanding it as dispatch analysis finds additional routes.
- Candidate test filenames do not establish coverage. Every row has a route-execution disposition, but broad behavioral categories remain incomplete: validation, auth/role, cross-academy cases, missing records, idempotence, and redaction need endpoint-specific evidence.
- Infrastructure files in this checkout have unrelated uncommitted differences from deployed AWS configuration. Do not deploy CloudFormation based on them.

## CRUD findings to implement next

- `DELETE /homework/{classId}/{homeworkId}` now dispatches in the final-mode facade, reusing the final homework-write flag and the assigned-teacher/admin service guard. Route tests cover dispatch, malformed identifiers and the disabled flag; service tests cover archive, audit, assignment checks and preserving submissions. The unified backend suites passed and the code-only Lambda deploy succeeded. Live archive behavior remains unverified because the signed-in teacher view has zero verified assigned classes; retry with an assigned teacher and an empty-roster class.
- `DELETE /operations/enrolment/{id}` is implemented as a versioned canonical end/archive with an audit record; its route/service tests exist, but live behavior and some negative cases still need verification.
- `DELETE /operations/family/{id}` remains blocked in final mode. The legacy implementation is not reachable and must stay that way. The final-mode family/student deactivate workflow and route semantics are not defined yet; design a canonical preview/archive flow that preserves links and history before implementation.
- The handover's admin student/family delete work is a planned feature, not an existing endpoint. Do not invent a live route or hard-delete records as part of this audit.

## Student-detail edit authorization audit

- **Administrator official name edit:** `PATCH /students/{id}` is supported by the final core identity facade only when `SADHANA_FINAL_CORE_WRITES=enabled`. It requires an authenticated administrator of the selected academy and an `expectedVersion`. The service's update allowlist accepts `name` only, preserves academy scope, increments the person version, updates the compatibility projection, and writes an audit item transactionally (`ACADEMY_STUDENTS_UPDATED`). Direct service tests now assert this behavior. Cross-academy admins are denied; people shared across academies are refused for reconciliation.
- **Administrator contact phone edit:** the Registration UI exposes a “Change student phone” action, but the final core update service allowlist is `students: ['name']`. A `{phone}` PATCH therefore fails as an unsupported/protected field in this path. The UI and final backend contract disagree. Do not widen the write allowlist casually: the service comment explicitly reserves contact changes for a dedicated workflow. Resolve the product/data ownership rule and add a transactional phone update with uniqueness/audit safeguards, or remove/disable the unsupported UI action.
- **Student self edit:** `PATCH /learner/{studentId}/profile` edits only `preferredName`, profile `phone`, and `about`; it does not change legal name, login email, roll number, date of birth, family relationship, or official student contact. Self access requires the exact active Cognito-linked student identity and a roll number for that academy.
- **Parent/guardian edit:** the same limited preference route accepts an on-behalf edit only when the actor is an active guardian in that academy and has a fresh approved, relationship-verified link to that student, with matching family IDs. A family association or a historical “student self” link alone is insufficient. Other student IDs and cross-academy links are denied.
- **Verification evidence:** focused tests passed: 5 core frontend route tests, 14 final core identity tests, 12 final learner-profile tests, 4 core-write service tests, and 3 new learner-profile adapter tests (38 total). The core facade tests use service mocks; core-write and learner-profile adapter tests inspect DynamoDB transaction commands. AWS configuration lookup failed because the Lambda endpoint was unreachable, so deployed feature-flag state and live permissions remain unverified.
- **Next audit slice:** continue P0 behavioral categories for sensitive reads, guardian writes, scheduling mutations, and enrolment archive; resolve the admin phone-edit UI/service mismatch before expanding to P2 behavioral cases.

## Audit progress

- All 158 inventoried method/path rows now have a route-execution disposition. The inventory combines the handover endpoint list with source-discovered M10 Academy and public intake entries; a complete static Lambda dispatch walk may still find additional paths. Route disposition is not full behavioral coverage.
- Every P0 and P1 route has source/test mapping. Some entries are source-inspected only, especially M9 onboarding and the separate public Sruti intake handler. These are not live/deployed claims. Exact fail-closed tests now cover family-access link alias, identity search, registration revocation, recurring-class creation/preview, teacher-link PATCH, master lifecycle PATCH, legacy practice writes, M9 write methods, and unsupported operations mutations.
- Canonical core writer tests now assert family creation (family, guardian, phone guard, sequence and audit), family update (primary contact and audit), family-linked student creation (pending guardian link, roll and audit), and enrolment creation (academy conditions, unique pair lock and audit). Direct M95 route tests now cover Sruti intake review dispatch, role/flag denial, payload/version validation, a conditional update scoped to Sruti, and conflict mapping. The normal `npm --prefix backend test` command passed with 364 TypeScript tests and 463 MJS tests; `npm --prefix backend run typecheck` passed. The user-visible calendar path remains live-verified from the earlier milestone; no new deployment was performed for this audit work.
- Behavioral cells remain substantially incomplete. Current CSV still has open/partial assessments in 134 request-validation contracts, 92 bad-input cases, 95 unauthenticated cases, 95 wrong-role cases, 92 wrong-academy cases, 101 missing-resource cases, 88 version-conflict cases, 93 audit cases, 100 idempotence cases, and 125 sensitive-data projections. These counts include routes with `source-inspected` evidence but no endpoint-specific negative test. The P0 guardian audit mapping also found that self-service and Sruti cross-academy pending-link creation persist timestamps on the link but do not write a separate audit item; decide whether policy requires one before enabling those writes.
- Next work is to add direct handler/service tests for the remaining M9 onboarding and public intake routes, then finish P0 security, validation, version, write/audit and redaction categories. The Sruti review handler remains a partial audit gap: conditional `institutionId=sruti` is asserted in the update expression, but there is no direct wrong-academy/missing-record test and no separate audit item is written. After P0, complete P1/P2 category gaps, reconcile the admin student-phone UI mismatch, and only then start Playwright. No CloudFormation, legacy IAM, or database retirement changes are part of this work.
