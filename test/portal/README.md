# Live dev portal regression suite

This opt-in Playwright suite signs into the deployed Sadhana **dev** portal as the configured administrator, teacher and student accounts. It is separate from the local synthetic browser tests and local API E2E tests. It does not start a local server.

## Setup and run

The root `.env.test.local` file is ignored by Git and loaded by `playwright.live.config.ts`. Keep the credentials there; never paste them into a command, test, CI setting or report.

```dotenv
SADHANA_TEST_USERNAME=...
SADHANA_TEST_PASSWORD=...
SADHANA_TEACHER_USERNAME=...
SADHANA_TEACHER_PASSWORD=...
SADHANA_STUDENT_USERNAME=...
SADHANA_STUDENT_PASSWORD=...
# Optional: select the Raagasudha dev hostname if it is configured for login.
SADHANA_LIVE_BASE_URL=https://sadhana-dev.raagasudhamusic.co.uk
```

By default the runner uses `https://sadhana-dev.sruti.co.uk`. The only permitted overrides are the two explicit dev portal origins in the live config; production origins are rejected. Use an override only when that hostname, its HTTPS certificate, Cognito callbacks and API CORS are configured. Missing credentials skip only the affected role test and are reported as skipped.

Run the complete suite:

```sh
npm run test:portal:live
```

Run one role or the public smoke check:

```sh
npm run test:portal:live -- --grep administrator
npm run test:portal:live -- --grep teacher
npm run test:portal:live -- --grep student
npm run test:portal:live -- --grep 'public sign-in'
```

The runner requires the accounts to complete email/password sign-in without an interactive MFA, password reset or new-password challenge. It waits for `/api/me` and confirms the resolved application role before exploring the portal.

## Coverage

| Account       | Live checks                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public        | Portal document, sign-in heading, email/username and password fields, sign-in button, and first-party bundle/API errors.                                                                                                                                                                          |
| Administrator | Dashboard; Families & Students, Website Registrations and Account Access; Classes & Timetable, Practice & Reports, Communications and Settings; Syllabus & Resources, Messages, Teachers, Venues, Administrators and My Profile; available Raagasudha and Śruti workspace switching; mobile menu. |
| Teacher       | Dashboard, My Classes, My Students, Practice & Reports, Syllabus & Resources, Messages, Teachers, Administrators, Venues and My Profile; read-only teacher directory controls; mobile menu.                                                                                                       |
| Student       | Dashboard, My classes, My learning, My Syllabus, Messages, My academy and My profile; nested class overview/timetable/attendance/venues; nested homework/practice; mobile menu.                                                                                                                   |

Each role test checks the section actually renders, not just that its navigation item exists. Diagnostics fail on uncaught browser errors, console errors, missing/failed portal bundles, failed Sadhana API requests, API responses 400+, a call to the production API stage, or any write request to the shared Sadhana API.

## Safety and limits

- All role checks are read-only. The suite does not create, edit, delete, import, invite, upload, submit or review shared dev records.
- It runs serially with one worker. Traces, screenshots and videos are disabled so authentication data is not saved in test artifacts. URL queries and long record identifiers are removed from diagnostic output.
- The suite intentionally is not in CI. Run it manually against dev after the corresponding frontend/backend versions are deployed.
- This is broad live role/page regression coverage, not a safe live CRUD suite. Create/update/delete behavior is covered by the local synthetic Playwright/API E2E suites. Live CRUD would need a dedicated disposable test tenant and cleanup contract first.
- Passing this suite is useful release evidence, but it does not establish production configuration parity, backup/restore readiness, or that every data-dependent workflow is enabled. Review `npm run check:prod:readiness` and the production release gate separately.
