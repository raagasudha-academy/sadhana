# Phase 1 repository baseline

## Purpose

Phase 1 establishes a clear, maintainable source tree and repeatable local quality checks for the existing Sadhana dev environment. It does not create a production environment, deploy changes, or move, migrate, or delete live data. Those are Phase 2 activities and wait until the owner accepts this baseline and explicitly approves the next stage.

## Active project structure

- `app/` contains the Vite frontend, source, static assets, unit tests and browser fixtures.
- `backend/` contains the Lambda source, colocated TypeScript/MJS tests, helper scripts and Python tests.
- `test/` contains isolated HTTP API end-to-end tests and Playwright browser tests.
- `infra/` contains infrastructure templates and configuration.
- `docs/` contains current guides, architecture records and retained historical/operational evidence.

The retired root `src/`, root `tests/`, root `index.html`, and duplicate ESLint configuration were removed. The root `src/` and `tests/` trees were outside the configured Vite, Vitest and Playwright paths. Duplicate backend TypeScript test copies and tracked/local backup files were removed after confirming the active copies and test commands. Historical decisions, release evidence, migration documentation and operational audits remain in the repository.

## Quality commands

From the repository root:

```sh
npm run verify
npm run verify:backend
npm run test:backend:e2e
npm run test:frontend:playwright
npm run test:e2e:all
python3 -m unittest discover -s backend/test -p 'test_*.py'
```

`npm run verify` checks Prettier formatting, ESLint, frontend TypeScript, frontend unit tests and the production frontend build. The backend checks run independently because it has its own TypeScript configuration and test commands. API E2E and Playwright tests use local synthetic data; they do not certify deployed AWS behavior. Python tests cover helper scripts.

## Data and release boundary

The existing dev environment remains the Phase 2 development environment. No production resources are created by this baseline. Any production rollout or data movement requires a separate reviewed plan, explicit owner approval, verified backups/rollback, and evidence that identity links, family links, institution scope, registration provenance, enrollment history and one-time identifiers are preserved. Retain the existing migration and cutover evidence until the relevant release gates are explicitly cleared.

## Acceptance record

Verification from the cleaned working tree:

- `npm run verify` — passed: format check, lint, TypeScript, 103 frontend tests and production frontend build. ESLint reports 41 existing React hook dependency warnings and no errors.
- `npm run verify:backend` — passed: backend TypeScript, 514 TypeScript/MJS tests and build.
- `npm run test:backend:e2e` — passed: 5 local HTTP API scenarios.
- `npm run test:frontend:playwright` — passed: 60 Playwright tests.
- `npm run test:e2e:all` — passed: both E2E suites together.
- `python -m unittest discover -s backend/test -p 'test_*.py'` — passed: 69 helper tests using `.venv-aws-test`, which has `boto3` installed.
- `npm run test:coverage` — passed: frontend coverage is 53.35% statements, 51.91% branches, 41.57% functions and 54.00% lines. Backend coverage is not yet measured.

The code and quality-command baseline is prepared for review. Phase 1 acceptance and the production/data-move gate remain pending owner review because frontend coverage is moderate and backend coverage has not been measured. No production environment was created and no live data was moved.
