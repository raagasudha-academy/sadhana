# Sadhana test suite map

This file records where tests currently live and what they cover. The repository layout is still being reorganized; see the [master roadmap](../Sadhana_Master_Roadmap_and_Requirements.md) for the remaining work.

## Frontend unit and component tests

Vitest tests are under `app/tests/`, grouped by role and feature. Run them with:

```sh
npm test
```

The full frontend check is `npm run verify`; it runs lint, typecheck, Vitest and the Vite production build.

## Backend API and service regression tests

The backend suite is currently in `backend/test/`, with one scheduling test under `backend/tests/`. Most tests use Node's test runner and `tsx`; Python `unittest` files cover selected helper scripts. These tests have not yet been moved beside `backend/src/`.

Run the TypeScript and MJS suites with:

```sh
npm --prefix backend test
```

Run the Python tests with:

```sh
python3 -m unittest discover -s backend/test -p 'test_*.py'
```

`backend/docs/api-coverage-audit.csv` maps route/method entries to test candidates. The 158 route entries are an inventory, not evidence of complete behavioral coverage.

## Backend end-to-end tests

There is not yet a backend end-to-end suite organized under `test/e2e-tests/`. The direct AWS helper in `backend/scripts/coreWritesAwsE2E.ts` is not an authenticated API E2E test; read [its safety note](../backend/scripts/CORE_WRITES_AWS_E2E.md) before using it.

## Playwright browser tests

Playwright specs are under `test/playwrighttests/`, grouped by role and feature. Current coverage is the synthetic administrator registration directory: student/family views, filters, archive/restore, CSV controls, visual states and viewport overflow. Teacher and student authenticated UI workflows are not yet covered. The fixtures use synthetic data and block requests outside the local Vite server.

Run the browser suite with:

```sh
npm run test:e2e
```

## Coverage status

The route audit and existing tests leave behavioral and security gaps. In particular, role permissions, academy isolation, guardian revocation, input validation, write/audit effects and all DELETE operations still need endpoint-by-endpoint acceptance. Do not treat a passing suite as API-wide coverage; the audit and roadmap track those gaps.
