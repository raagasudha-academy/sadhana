# Live dev portal checks

These Playwright checks run against the deployed dev portal. They use their own config and command; they are separate from the local synthetic browser suite and the isolated API E2E suite.

## Setup and run

Install the Chromium browser if needed. The runner loads credentials from the ignored `.env.test.local` file at the repository root; it also honours variables already exported in the shell. Do not commit this file or copy credentials into source files or CI.

```dotenv
SADHANA_TEST_USERNAME=...
SADHANA_TEST_PASSWORD=...
SADHANA_TEACHER_USERNAME=...
SADHANA_TEACHER_PASSWORD=...
SADHANA_STUDENT_USERNAME=...
SADHANA_STUDENT_PASSWORD=...
```

Run the suite:

```sh
npm run test:portal:live
```

The target is restricted to `https://sadhana-dev.sruti.co.uk`; `SADHANA_LIVE_BASE_URL` is accepted only when it equals that HTTPS origin. Missing role credentials cause that role's test to skip; the public smoke check still runs. The config disables traces, screenshots and video to avoid saving authenticated page state or credentials in test artifacts.

The role accounts must be able to sign in with email and password without an interactive MFA, password-reset, or new-password challenge. The fixture waits for the authenticated `/api/me` response and verifies the resolved application role.

## Safety and coverage

- The live suite starts no local server and makes requests only as needed to load pages and sign in.
- It does not create, edit, delete, import, invite, upload, or otherwise mutate portal records.
- Tests run serially to reduce sign-in traffic and avoid Cognito throttling.
- Diagnostics collect browser console errors, uncaught page errors, failed portal and Sadhana API requests, and portal/API HTTP responses with status 400 or higher. Query strings are omitted from recorded request URLs.
- The checks establish only that the selected live pages and role authentication are working at run time. They do not prove full feature workflows or production readiness.
- The suite is intentionally absent from GitHub Actions. Add it to CI only after using isolated accounts and data with verified cleanup.
