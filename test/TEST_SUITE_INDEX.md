# Sadhana test suite map

This index describes the current test locations and what each suite verifies. The API coverage audit is tracked separately in [`backend/docs/api-coverage-audit.csv`](../backend/docs/api-coverage-audit.csv).

## Frontend unit and component tests

Vitest tests are under `app/tests/`, grouped by role and feature. Run them with:

```sh
npm run test:frontend:unit
```

`npm run verify` runs frontend formatting, lint, typecheck, Vitest and the Vite production build. `npm test` remains an alias for frontend unit tests.

## Backend API and service regression tests

Backend TypeScript and MJS unit, service and handler tests are colocated under `backend/src/__tests__/`. They exercise route wiring, policies, validation, security rules, transaction commands and regressions. Selected Python tests for backend helper scripts remain in `backend/test/`.

Run both backend suites with:

```sh
npm run test:backend:unit
```

That command runs backend `test:ts` and then `test:mjs`. Selected Python helper-script tests can be run with:

```sh
python3 -m unittest discover -s backend/test -p 'test_*.py'
```

## Backend end-to-end tests

The local authenticated API E2E suite is under `test/e2e-tests/backend/`. It starts an ephemeral HTTP server around the real Lambda handler, injects synthetic API Gateway authorizer claims, and uses in-memory DynamoDB doubles. It verifies create/read/update/audit flows, permission denials, academy isolation, input validation, health mode contracts, final-mode route blocking, retired calendar sync, and final-mode family deletion with permanent roll reservations. It makes no AWS calls and does not verify a deployed API Gateway authorizer or Lambda environment.

Run it with:

```sh
npm run test:backend:e2e
```

`backend/scripts/coreWritesAwsE2E.ts` is a separate guarded AWS helper; read [`backend/scripts/CORE_WRITES_AWS_E2E.md`](../backend/scripts/CORE_WRITES_AWS_E2E.md) before using it.

## Playwright browser tests

Playwright tests are organized by page/feature under `test/playwrighttests/pages/<feature>/`, with role cases grouped inside each page suite. Examples include `dashboard/`, `classes-timetable/`, `families-students/`, `my-learning/` and `my-profile/`. Shared synthetic sessions and network restrictions are in `test/playwrighttests/fixtures/`. Family deletion verifies source registration history and roll reservation retention; website registration covers a second academy family for a parent with an existing Sruti login and linking that verified account.

Each role/page navigation spec has screenshot baselines beside it in `*-snapshots/` folders. The suite now has 148 screenshots across administrator, teacher, student and guardian views, plus interaction and responsive checks. The full Playwright run passes 66 tests. All role fixtures use synthetic data and block requests outside the local Vite server.

The exhaustive navigation matrix is in [`pages/navigation-matrix.spec.ts`](playwrighttests/pages/navigation-matrix.spec.ts). It opens every primary page for administrator, teacher, student and guardian views, covers the administrator tabs in both academy workspaces, and snapshots the visible ARIA, registration, operations and teacher-workspace tabs. A separate scenario supplies synthetic records to reach student and class detail tabs that are hidden in the empty-state fixture. All requests remain on the local Vite fixture.

Run browser tests and compare them with the screenshots using:

```sh
npm run test:frontend:playwright
```

## Live dev portal checks

Read-only Playwright regression checks against the deployed dev portal are in `test/portal/`. They have a separate config and never start the local Vite server. The runner allows only the two explicit dev portal origins in `playwright.live.config.ts`; production origins are rejected. Public smoke runs without credentials; administrator, teacher and student checks use role-specific environment variables, assert the role returned by `/api/me`, then visit each role's major sections and nested tabs. Diagnostics fail on runtime errors, failed first-party bundles/API requests, production-stage API routing, and shared API writes.

Run them intentionally with:

```sh
npm run test:portal:live
```

See [`test/portal/README.md`](portal/README.md) for credential setup, target safety, the role/page matrix and limits. These live tests are not part of CI and perform no record writes. The existing synthetic browser suite and guarded AWS helper remain separate. Live data mutation coverage requires an isolated disposable tenant and cleanup contract.

Refresh screenshot baselines intentionally with:

```sh
npm run test:e2e:update
```

## Coverage status

The current baseline has 103 passing frontend unit/component tests, 514 passing backend TypeScript/MJS tests, 5 local HTTP API E2E scenarios, 60 passing Playwright tests, and 69 passing Python helper tests. Frontend unit coverage is 53.35% statements, 51.91% branches, 41.57% functions and 54.00% lines. Backend coverage is not yet measured by the current runner. Coverage is not yet strong enough to call the production gate satisfied; continue adding focused tests for untested API/client and profile/upload paths, plus backend route behavior. The route audit has a regression gate: every one of its 158 unique method/path rows must point to an existing test file, all referenced files must resolve, and no row may claim its route execution test is missing. This proves traceability, not complete behavioral coverage. Deployed AWS behavior remains separately verified.
