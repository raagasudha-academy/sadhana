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
- `app/tests/` — frontend unit tests grouped by role and feature
- `app/public/` and `app/index.html` — frontend static assets and entry point
- `backend/src/` — backend Lambda and feature modules; backend tests are still in `backend/test/` pending their move beside source
- `test/e2e-tests/` — reserved for backend end-to-end scenarios; no suite is organized here yet
- `test/playwrighttests/` — Playwright browser and visual tests, grouped by role and feature
- `test/test_isolated_release.py` — release-script regression check
- `infra/` — infrastructure source

The detailed completed and outstanding work is tracked in the [master roadmap](Sadhana_Master_Roadmap_and_Requirements.md).

See the test suite map for commands and coverage limits. The endpoint matrix is an audit inventory, not proof that every route is fully covered.

## Deploy

- Backend code-only Lambda update: `npm run deploy:backend`. It verifies the expected AWS account and Lambda, runs backend checks/build, downloads a rollback bundle, asks for a typed confirmation, updates Lambda code only, then verifies the deployed hash and unchanged environment/role. Preview without a code update using `npm run deploy:backend -- --dry-run`.
- Frontend GitHub Pages release: `npm run deploy:frontend`. It dispatches the Pages workflow for the current branch after checking that the frontend files are committed and the remote branch points to the same commit. GitHub Actions runs verification and publishes the site.

Neither command deploys CloudFormation or changes IAM/database resources. Do not run either command until you have reviewed the source changes being deployed.

## Production documentation gate

Before the production deployment, prepare a practical user guide for administrators and teachers, with screenshots that match the release. The guide will cover the common role-specific workflows. Whether to publish it as a tutorial site or a document remains undecided; choose the format during that roadmap task.
