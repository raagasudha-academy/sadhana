# Sadhana source conventions

## Architecture

Sadhana is a **modular monolith**: a Vite/React frontend and an AWS Lambda backend. A folder does not imply an independently deployed microservice. Preserve existing API paths, Cognito authorisation, institution scoping, DynamoDB keys and Lambda handler contract during structural changes.

- `src/app/`: application composition, shell, navigation.
- `src/features/<domain>/`: domain-specific UI, hooks and local CSS.
- `src/components/`: presentation components reused across features.
- `src/api/`: shared frontend API boundary.
- `backend/src/`: modular domain logic behind a single Lambda entrypoint; backend TypeScript/MJS regression tests are grouped under `backend/src/__tests__/`.
- `app/tests/`: frontend unit tests grouped by role and feature.
- `test/e2e-tests/`: backend HTTP end-to-end tests; `test/playwrighttests/`: browser tests grouped by page.
- `backend/test/`: Python helper-script tests only.

These are target boundaries. Move files only when their dependencies have been examined.

## Names

- React components and their component-specific CSS: `PascalCase.tsx`, `PascalCase.css`.
- Other TS modules, hooks and utilities: `camelCase.ts`, e.g. `useStudentCalendar.ts`.
- Test files: `<subject>.test.ts` or `<subject>.test.tsx`.
- Do not put migration milestone labels such as `M8`, `M9`, `M10`, `M91`, or `M95` in project filenames. Name files for their domain or purpose; record milestones in Git history and documentation content.
- Don't commit `.zip`, `.bak`, `.orig`, `.rej`, editor swap files or generated build outputs.
- Use Git for rollback; don't create local backup trees in the repo.

## Small-refactor protocol

1. Start from a clean Git working tree on `refactor/modular-architecture`.
2. Run `node scripts/auditArchitecture.mjs > docs/architecture/inventory.md` to capture the current baseline (optional to commit the dated report).
3. Extract one cohesive component/utility or CSS group at a time; keep a compatibility export where necessary.
4. Run `npm run verify` and `(cd backend && npm run check && npm run build)` before committing.
5. Record any deliberate behaviour changes separately from file moves.
6. Never change permissions, data schema, website-import/revocation or student access control in a housekeeping-only commit.

## Safe order of work

1. Document module boundaries and create the inventory (M2).
2. Extract leaf presentational components from StudentHome, with regression coverage (M3).
3. Split RegistrationModule only after reviewing its data flows and permissions (M4).
4. Split App composition and consolidate styles in small groups (M5).
5. Modularise backend routing, preserving its handler filename and deployment entry (M6).
