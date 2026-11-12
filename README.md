# Sadhana Academy & Learning Portal

Portal for Raagasudha and Śruti Vedam, with a React/Vite frontend and a Node/AWS backend.

## Start here

- [Phase 1 baseline and release boundary](docs/PHASE_1_BASELINE.md)
- [Master roadmap and requirements](Sadhana_Master_Roadmap_and_Requirements.md)
- [API coverage audit](backend/docs/API_COVERAGE_AUDIT.md) and [endpoint matrix](backend/docs/api-coverage-audit.csv)
- [Charu requirements](docs/Sadhana_Charu_Requirements_v1.7.md)
- [Test suite map](test/TEST_SUITE_INDEX.md)
- [Contributing and source conventions](CONTRIBUTING.md)

## Project areas

- `app/src/` — frontend application
- `app/tests/` — frontend unit tests grouped by role and feature, with shared/architecture suites
- `app/public/` and `app/index.html` — frontend static assets and entry point
- `backend/src/` — backend Lambda and feature modules, with TypeScript/MJS regression tests under `src/__tests__/`
- `backend/test/` — Python tests for backend helper scripts
- `test/e2e-tests/backend/` — authenticated HTTP API end-to-end tests using synthetic claims and an in-memory store
- `test/playwrighttests/pages/` — browser and visual tests organized by page, with role cases in each page suite
- `test/playwrighttests/fixtures/` — shared synthetic role sessions and network guards
- `test/test_isolated_release.py` — release-script regression check
- `infra/` — infrastructure source
- `scripts/` — repository checks, development helpers and guarded release commands

Backend unit and handler tests are colocated under `backend/src/__tests__/`. The backend end-to-end suite is local and isolated: it does not exercise deployed AWS authorization or persistence.

The detailed completed and outstanding work is tracked in the [master roadmap](Sadhana_Master_Roadmap_and_Requirements.md). Phase 1 is the source and quality baseline for the existing dev environment. Production creation and data movement are separate Phase 2 work and require the owner's approval after the baseline and tests have been reviewed.

See the test suite map for commands and coverage limits. The endpoint matrix is an audit inventory, not proof that every route is fully covered.

## Local quality checks

Install dependencies with `npm ci` at the repository root and `npm ci` in `backend/`. The focused test commands are:

| Command                                     | What it runs                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run test:frontend:unit`                | Frontend Vitest unit/component tests                                       |
| `npm run test:backend:unit`                 | Backend TypeScript and MJS unit/regression tests                           |
| `npm run test:backend:e2e`                  | Local authenticated HTTP API E2E tests                                     |
| `npm run test:frontend:playwright`          | Browser tests using Playwright                                             |
| `npm run test:e2e:all`                      | Both API and browser E2E suites                                            |
| `npm run test:product`                      | Frontend/backend unit tests plus both E2E suites                           |
| `npm run verify` / `npm run verify:backend` | Frontend format/lint/typecheck/tests/build / backend typecheck/tests/build |

The original aliases remain available: `npm test` runs frontend unit tests and `npm run test:e2e` runs Playwright. Python helper tests use the command in the test suite map.

The Python helper tests also need `boto3` installed. Run `python -m unittest discover -s backend/test -p 'test_*.py'` from a Python environment with `boto3` available; the repository's `.venv-aws-test` already includes it.

## Deploy

| Command                          | Deployment                                                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run deploy:backend`         | Guarded code-only Lambda update after account/target checks, backend tests/build, rollback bundle, and typed confirmation. It does not change infrastructure, IAM, environment variables or database resources. |
| `npm run deploy:backend:dry-run` | Runs backend checks/build and verifies the AWS target, but makes no AWS changes.                                                                                                                                |
| `npm run deploy:frontend`        | Dispatches the GitHub Pages workflow after checking the frontend changes are committed and the remote branch matches local HEAD. GitHub Actions verifies and publishes the site.                                |

Neither command deploys CloudFormation or changes IAM/database resources. Do not run either command until you have reviewed the source changes being deployed.

## Production documentation gate

Before the production deployment, prepare a practical user guide for administrators and teachers, with screenshots that match the release. The guide will cover the common role-specific workflows. Whether to publish it as a tutorial site or a document remains undecided; choose the format during that roadmap task.
