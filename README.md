# Sadhana Academy & Learning Portal

Portal for Raagasudha and Śruti Vedam, with a React/Vite frontend and a Node/AWS backend.

## Current deployment

- Production portals: [sadhana.sruti.co.uk](https://sadhana.sruti.co.uk) and [sadhana.raagasudhamusic.co.uk](https://sadhana.raagasudhamusic.co.uk).
- Dev portal: [sadhana-dev.sruti.co.uk](https://sadhana-dev.sruti.co.uk), deployed to GitHub Pages with the dev API and Cognito configuration.
- Changes merged to `main` run the quality checks and dev deployments. The production portal workflow runs after those succeed and waits for approval from the protected GitHub `production` environment.

The phase baseline and roadmap below preserve planning and implementation records from before production existed. Their production-readiness statuses may be historical; use the current workflows and deployment configuration when reviewing release status.

## Start here

- [Phase 1 baseline and release boundary](docs/PHASE_1_BASELINE.md) (historical baseline)
- [Master roadmap and requirements](Sadhana_Master_Roadmap_and_Requirements.md) (includes earlier release planning)
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

The [master roadmap](Sadhana_Master_Roadmap_and_Requirements.md) records project decisions and planned work, including items written before the production rollout. Reconcile those historical status entries before using the roadmap as a current release checklist.

See the test suite map for commands and coverage limits. The endpoint matrix is an audit inventory, not proof that every route is fully covered.

## Local quality checks

Install dependencies with `npm ci` at the repository root and `npm ci` in `backend/`. The focused test commands are:

| Command                                     | What it runs                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run test:frontend:unit`                | Frontend Vitest unit/component tests                                       |
| `npm run test:backend:unit`                 | Backend TypeScript and MJS unit/regression tests                           |
| `npm run test:backend:e2e`                  | Local authenticated HTTP API E2E tests                                     |
| `npm run test:frontend:playwright`          | Browser tests using Playwright                                             |
| `npm run test:python`                       | Python helper tests                                                        |
| `npm run test:e2e:all`                      | Both API and browser E2E suites                                            |
| `npm run test:all` / `npm run test:dev`     | Frontend/backend unit tests, both E2E suites, and Python helper tests      |
| `npm run test:prod`                         | Full local suite plus production cutover readiness gates                   |
| `npm run verify` / `npm run verify:backend` | Frontend format/lint/typecheck/tests/build / backend typecheck/tests/build |

`npm test` remains a short alias for frontend unit tests. Use `npm run test:frontend:playwright` for browser tests. Python helper tests use the command in the test suite map.

The Python helper tests also need `boto3` installed. `npm run test:all` invokes them through `npm run test:python`.

## Deploy

| Command                                                      | Deployment                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run deploy:backend`                                     | Guarded code-only update of the dev Lambda after account/target checks, backend tests/build, rollback bundle, and typed confirmation. It does not change infrastructure, IAM, environment variables or database resources. |
| `npm run deploy:backend:dry-run`                             | Runs backend checks/build and verifies the dev AWS target, but makes no AWS changes.                                                                                                                                       |
| `npm run deploy:frontend`                                    | Dispatches the GitHub Pages dev workflow after checking frontend changes are committed and the remote branch matches local HEAD. GitHub Actions verifies and publishes the dev site.                                       |
| `npm run deploy:dev:backend` / `npm run deploy:dev:frontend` | Explicit aliases for the dev backend and GitHub Pages deploy commands.                                                                                                                                                     |

These local commands do not deploy production, CloudFormation, or change IAM/database resources. Production portal releases are handled by the `Quality checks` workflow in `.github/workflows/entrypoint.yaml`: after checks and dev deployment, the protected `production` environment must approve the production portal job.

## Production release approval

Pushes to `main` run the quality checks and dev deployments before the production portal deployment is offered for approval. The job waits on the GitHub `production` environment before it can access AWS. A portal-only release can also be dispatched manually from `main` by selecting the `portal` target. In repository Settings → Environments → `production`, configure required reviewers; the workflow file alone does not enforce that review rule.

## Release documentation follow-up

The roadmap still lists administrator and teacher user guides with release-matching screenshots as planned work. Its “before production deployment” label predates the current production rollout; treat the guides as a follow-up documentation task.
