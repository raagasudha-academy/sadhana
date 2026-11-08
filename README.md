# Sadhana Academy & Learning Portal

Portal for Raagasudha and Śruti Vedam, with a React/Vite frontend and a Node/AWS backend.

## Start here

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

Backend unit and handler tests are colocated under `backend/src/__tests__/`. The backend end-to-end suite is local and isolated: it does not exercise deployed AWS authorization or persistence.

The detailed completed and outstanding work is tracked in the [master roadmap](Sadhana_Master_Roadmap_and_Requirements.md).

See the test suite map for commands and coverage limits. The endpoint matrix is an audit inventory, not proof that every route is fully covered.

## Deploy

- Backend code-only Lambda update: `npm run deploy:backend`. It verifies the expected AWS account and Lambda, runs backend checks/build, downloads a rollback bundle, asks for a typed confirmation, updates Lambda code only, then verifies the deployed hash and unchanged environment/role. Preview without a code update using `npm run deploy:backend -- --dry-run`.
- Frontend GitHub Pages release: `npm run deploy:frontend`. It dispatches the Pages workflow for the current branch after checking that the frontend files are committed and the remote branch points to the same commit. GitHub Actions runs verification and publishes the site.

Neither command deploys CloudFormation or changes IAM/database resources. Do not run either command until you have reviewed the source changes being deployed.

## Production documentation gate

Before the production deployment, prepare a practical user guide for administrators and teachers, with screenshots that match the release. The guide will cover the common role-specific workflows. Whether to publish it as a tutorial site or a document remains undecided; choose the format during that roadmap task.
