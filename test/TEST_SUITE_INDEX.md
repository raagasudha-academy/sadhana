# Sadhana test suite map

This index describes the current test locations and what each suite verifies. The API coverage audit is tracked separately in [`backend/docs/api-coverage-audit.csv`](../backend/docs/api-coverage-audit.csv).

## Frontend unit and component tests

Vitest tests are under `app/tests/`, grouped by role and feature. Run them with:

```sh
npm test
```

`npm run verify` runs frontend lint, typecheck, Vitest and the Vite production build.

## Backend API and service regression tests

Backend TypeScript and MJS tests live under `backend/test/`; one scheduling test is under `backend/tests/`. The current `backend/test/` inventory has 91 `*.test.ts` files and 65 `*.test.mjs` files. They exercise route wiring, policies, services, validation, security rules and regressions. Most are unit, component or handler-level tests; they do not prove every live API route end to end.

Run both backend suites with:

```sh
npm --prefix backend test
```

That command runs `test:ts` and then `test:mjs`. Selected Python helper-script tests can be run with:

```sh
python3 -m unittest discover -s backend/test -p 'test_*.py'
```

## Backend end-to-end tests

The local authenticated API E2E suite is under `test/e2e-tests/backend/`. It starts an ephemeral HTTP server around the real Lambda handler, injects synthetic API Gateway authorizer claims, runs the real `SadhanaRepository` against an in-memory DynamoDB DocumentClient double, and verifies create/read/update/audit flows, permission denials, academy isolation, input validation, health mode contracts, final-mode route blocking and retired calendar sync. It makes no AWS calls and does not verify a deployed API Gateway authorizer or Lambda environment.

Run it with:

```sh
npm run test:e2e:backend
```

`backend/scripts/coreWritesAwsE2E.ts` is a separate guarded AWS helper; read [`backend/scripts/CORE_WRITES_AWS_E2E.md`](../backend/scripts/CORE_WRITES_AWS_E2E.md) before using it.

## Playwright browser tests

Playwright tests are organized by page/feature under `test/playwrighttests/pages/<feature>/`, with role cases grouped inside each page suite. Examples include `dashboard/`, `classes-timetable/`, `families-students/`, `my-learning/` and `my-profile/`. Shared synthetic sessions and network restrictions are in `test/playwrighttests/fixtures/`.

Each role/page navigation spec has a matching screenshot baseline beside it in a `page.spec.ts-snapshots/` folder. The current suite has 34 screenshot baselines across admin, teacher, student and guardian views, plus interaction, responsive and visual regression tests for the administrator family/student directory. The full current Playwright run passes 49 tests. All role fixtures use synthetic data and block requests outside the local Vite server.

Run browser tests and compare them with the screenshots using:

```sh
npm run test:e2e
```

Refresh screenshot baselines intentionally with:

```sh
npm run test:e2e:update
```

## Coverage status

The route audit has a regression gate: every one of its 158 unique method/path rows must point to an existing test file, all referenced files must resolve, and no row may claim its route execution test is missing. This proves traceability, not complete behavioral coverage. The backend suites currently contain 390 TypeScript tests and 471 MJS tests; the HTTP API E2E suite has 4 scenarios. Continue closing per-route gaps for permissions, academy isolation, guardian revocation, validation, writes/audits and DELETE behavior. Deployed AWS behavior remains separately verified.
