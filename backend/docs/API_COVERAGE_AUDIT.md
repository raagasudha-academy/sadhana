# Sadhana API coverage audit — working inventory

Updated 8 November 2026. This remains a working audit, not a claim that all 158 inventoried endpoints are fully tested.

## Evidence and scope

`api-coverage-audit.csv` contains 158 distinct method + route-pattern rows: the 150 expanded entries from handover section 5 plus four source-discovered `m10-academy` writes and four public Sruti intake methods (`POST`/`OPTIONS` at `/` and `/register`) found in `infra/sruti-public-intake.yml`. The public intake rows describe local infrastructure source only; deployment must be checked against AWS before using them as live contracts.

The matrix separates evidence from assumptions. As of 8 November, 70 of 158 rows still have no route-execution assessment; candidate handler and test filenames are leads, not proof. Route execution evidence does not imply full category coverage or deployed/live verification. The matrix deliberately does not calculate a coverage percentage from test counts.

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

1. Continue exact route and test-title mapping through P1 then P2 rows; classify each test as handler-level, service-level, static, integration, or live E2E.
2. Inspect `lambda.ts` dispatch ordering and feature flags for each remaining route; distinguish final-mode live, legacy blocked, feature-gated, retired, and source-only.
3. For supported mutations, map canonical writer/adapters and assert side effects, audit records, academy isolation and version conflicts; for unsupported legacy paths, keep exact fail-closed route assertions.
4. Design/document the not-yet-specified student/family deactivation workflows before adding or enabling APIs.
5. Run the unified backend suites after adding test batches; add handler coverage instrumentation only after all route fixtures are ready.
6. Commit audit/test changes in small local increments; begin Playwright after API contracts and behavioral coverage gaps are closed.

## Current known limitations

- The matrix inventory is not yet exhaustive for every path discovered by a full static dispatch walk; it includes the handover baseline plus the source additions above. Continue expanding it as dispatch analysis finds additional routes.
- Candidate test filenames do not establish coverage. All exact test titles and coverage categories other than the focused calendar slice remain to be audited.
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
- **Next audit slice:** add missing/archived student update cases; reconcile the phone-edit mismatch; then continue the P0 route inventory with exact dispatcher, contract and test evidence.

## Audit progress

- The route matrix remains 158 method/path rows. Focused audit evidence now covers the two calendar live checks, homework archive routing, enrolment/family deletion boundaries, administrator student-name editing, and student/verified-guardian preference editing. The current test evidence for student writes is code-level; its final-mode feature flags could not be read from AWS during this audit because the Lambda endpoint was unreachable.
- All 61 P0 method/path rows have route-execution evidence; 70 of 158 rows overall remain unassessed in that column. Evidence remains mixed: some paths have mocked facade tests, some have service transaction assertions, and some are explicitly blocked by the final-only boundary. `/family-access/links`, registration revocation, schedule teacher-link PATCH, master lifecycle PATCH and recurring-class routes remain unsupported in final mode and need explicit route tests or approved canonical replacements.
- P1 operations audit is now mapped: all seven `/operations/*` GETs have facade tests; student and enrolment POST plus feedback POST/PATCH have canonical behavior; unsupported legacy writes have exact final-boundary assertions. Enrolment DELETE is separately covered. P1 M10 class and venue create/update paths have facade tests, including new venue writer-argument coverage; their writer transaction/audit semantics and live flags remain unverified. Existing `/classes` and `/venues` read/write facade rows now have exact read, create, update, academy, version, and shared-venue denial tests; these mock the target writer, so they do not verify its deployed audit transaction. Sixteen learner/homework P1 write rows now map to the final facade tests; those tests prove whitelisted dispatch and feature flags, while identity/role, enrolment, storage, and audit behavior remain delegated to service tests and still need tighter endpoint mapping.
- The operations and M10 route test batch passed (54 MJS tests); the full TypeScript suite passed (357 tests). There are 48 route-execution rows still unassessed (19 P1, 28 P2, and 1 P3). Continue replacing `UNASSESSED` only when dispatch or tests provide evidence, then fill behavioral category gaps before Playwright.
