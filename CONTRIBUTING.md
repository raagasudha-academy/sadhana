# Sadhana contribution guide

## Repository layout

Sadhana is a modular monolith: a Vite/React frontend and an AWS Lambda backend. A folder does not imply an independently deployed service. Preserve API paths, Cognito authorization, institution scoping, DynamoDB keys and the Lambda handler contract when changing structure.

- `app/src/` — frontend application source.
- `app/tests/` — frontend unit and component tests.
- `app/public/` and `app/index.html` — frontend assets and HTML entry point.
- `backend/src/` — Lambda entry point, domain modules and TypeScript/MJS regression tests in `__tests__/`.
- `backend/test/` — Python tests for backend helper scripts.
- `backend/scripts/` — backend maintenance and operational scripts.
- `test/e2e-tests/backend/` — local authenticated HTTP API end-to-end tests.
- `test/playwrighttests/` — browser tests and screenshot baselines.
- `infra/` — infrastructure source.
- `docs/` — architecture, operational guidance, decisions and retained historical records.

## Naming and formatting

- React components and component-specific styles use `PascalCase` filenames, such as `StudentCard.tsx` and `StudentCard.css`.
- Other TypeScript modules, hooks and utilities use `camelCase`, such as `useStudentCalendar.ts`.
- Tests use `<subject>.test.ts` or `<subject>.test.tsx`; Playwright specs use `.spec.ts`.
- Name files for their domain or purpose. Keep milestone/version labels in documentation or Git history, not new source filenames.
- Use the configured Prettier style and ESLint rules. Run `npm run format`, `npm run lint`, and the relevant typecheck/tests before submitting.
- Do not commit backup copies, editor swap files, generated build output, credentials or local audit output. Use Git history for recovery.

## Change safety

1. Check `git status` and preserve unrelated local changes.
2. Keep changes focused and inspect the diff, especially for authorization, institution routing, family/learner links, registration imports, deletion, counters and data access.
3. Run `npm run verify` for frontend changes. For backend changes, run `npm run verify:backend`.
4. Run `npm run test:backend:e2e` or `npm run test:frontend:playwright` when the change affects those paths. Run Python helper tests after changing Python helpers.
5. Document any known test gap or limitation. A passing local suite does not prove deployed AWS behavior.

## Phase boundary

Phase 1 establishes a clean, reviewed, tested code baseline in the existing dev environment. Production environment creation and data movement belong to Phase 2 and must wait for the owner's explicit approval after Phase 1 acceptance. Do not change live data or infrastructure as part of routine code cleanup.
