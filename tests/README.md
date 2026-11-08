# Sadhana test suite map

## Browser end-to-end tests

All Playwright E2E specs live under `tests/e2e-tests/`, grouped by user role and then feature:

```text
tests/e2e-tests/
├── admin/
│   └── directory/
│       ├── interactions.spec.ts
│       ├── portal.spec.ts
│       ├── responsive.spec.ts
│       └── visual.spec.ts
└── fixtures/
    ├── portal.html
    ├── portal.tsx
    ├── visual.html
    └── visual.tsx
```

The current browser E2E coverage is the synthetic administrator registration directory: student/family views, filters, archive/restore, CSV controls, visual states, and viewport overflow. Teacher and student authenticated workflows do not yet have role-specific E2E specs. Fixtures use synthetic data and block requests outside the local Vite server.

Run the browser suite with:

```sh
npm run test:e2e
```

## API regression tests

Backend API route, service, policy, and writer tests remain with the backend package in `backend/test/` (plus one scheduling test in `backend/tests/`). They use the Node test runner, `tsx`, and some Python `unittest` files.

Run the TypeScript and MJS API suites with:

```sh
npm --prefix backend test
```

`backend/docs/api-coverage-audit.csv` is the endpoint-by-endpoint index. Its `existing_test_candidates` and `exact_test_names` columns map route rows to tests; its other columns record expected behavior and category gaps. The narrative status and limitations are in `backend/docs/API_COVERAGE_AUDIT.md`. The matrix currently lists 158 method/path patterns; it is not proof that every route has complete behavioral coverage.

## Frontend unit and component tests

Vitest tests are in `tests/` and the legacy `test/` directory. Run them with:

```sh
npm test
```

The complete frontend local check is `npm run verify`; it runs lint, typecheck, Vitest, and the production build.
