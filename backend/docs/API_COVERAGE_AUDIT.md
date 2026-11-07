# Sadhana API coverage audit — working inventory

Updated 7 November 2026. This is the first audit deliverable, not a claim that 158 endpoints are fully tested.

## Evidence and scope

`api-coverage-audit.csv` contains 158 distinct method + route-pattern rows: the 150 expanded entries from handover section 5 plus four source-discovered `m10-academy` writes and four public Sruti intake methods (`POST`/`OPTIONS` at `/` and `/register`) found in `infra/sruti-public-intake.yml`. The public intake rows describe local infrastructure source only; deployment must be checked against AWS before using them as live contracts.

The matrix separates evidence from assumptions. Every route except the two live-verified calendar operations remains `UNASSESSED`; candidate handler and test filenames are leads, not proof. Exact existing test names, status/schema contracts, permissions, and per-category behavioural evidence still need review. The matrix deliberately does not calculate a coverage percentage from test counts.

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

1. Replace candidate file names with exact test names and classify each test as handler-level, service-level, static, integration, or live E2E.
2. Inspect `lambda.ts` dispatch ordering and feature flags for every route; classify final-mode live, legacy blocked, feature-gated, retired, and source-only.
3. Complete P0 rows first: calendar, homework, enrolment/family destructive operations, guardian decisions, and registration/revocation flows. Add real route-handler tests for missing categories; assert side effects, audit records, academy isolation, and fail-closed legacy boundaries.
4. Audit remaining P1/P2 routes and design/document the not-yet-specified student/family deletion workflows before adding API rows for them.
5. Add `npm run test:ts`, `npm run test:mjs`, and unified `npm test`; measure handler coverage only after instrumentation runs over those handlers.
6. Commit audit/test changes in small local increments; begin Playwright only after API contracts and P0 gaps are closed.

## Current known limitations

- The matrix inventory is not yet exhaustive for every path discovered by a full static dispatch walk; it includes the handover baseline plus the source additions above. Continue expanding it as dispatch analysis finds additional routes.
- Candidate test filenames do not establish coverage. All exact test titles and coverage categories other than the focused calendar slice remain to be audited.
- Infrastructure files in this checkout have unrelated uncommitted differences from deployed AWS configuration. Do not deploy CloudFormation based on them.
