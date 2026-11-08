# M9.3: Opt-in conditional write repositories and narrow API surface

## Scope

Local implementation only. Existing five-table services and tableRouter stay unchanged. No AWS operations, cloud resources or migrations are performed by installation. The generic M9 writer has `create` and `update` operations covering all 18 approved target table names, but **only classes and events are exposed through the new HTTP write route**. All other entity writes need purpose-built workflows, authorisation and consistency constraints before exposure.

## Install

From Sadhana repository root:

```sh
unzip -o ~/Downloads/sadhana-m9-3-writes-local.zip -d .
python3 apply_m9_writes.py
cd backend
npm run typecheck
node --import tsx --test test/writeIntegration.test.ts test/apiIntegration.test.ts
npm run check
npm run build
```

The `apply_m9_writes.py` script alters only `backend/src/lambda.ts`, inserts the M9 write route immediately before the M9 read route, and is idempotent. No backups are created. The one-time Python installer need not be committed.

## Feature flags — DO NOT ENABLE YET

Both of these must equal the literal `enabled` for writes to be attempted:

- `M9_API_WRITES_ENABLED=enabled`
- `M9_TARGET_REPOSITORY_WRITES=enabled`

These values are deliberately not set by any file or installer in the package. They must remain unset. The 18 target DynamoDB tables are not provisioned and the new path has not completed integration and security verification. The existing read-only M9 API continues to use its own read flags.

## Planned API contract (not deployable yet)

- `POST /api/m9/record/classes?institution=raaga` — create class, requires body `classId`, `institutionId`, `name`.
- `PATCH /api/m9/record/classes/{classId}?institution=raaga` — body `{ "expectedVersion": 1, "changes": {"name":"Revised"} }`.
- The same POST/PATCH shape for `events`, requiring `eventId`, `institutionId`, `title` on create.
- Other M9 write entity endpoints return HTTP 405.

HTTP auth checks Cognito administrator claims for the selected institution. Creates require request body institution to match the query scope. Updates enforce the immutable stored `institutionId` and current `version` **atomically in the DynamoDB condition**. A conditional failure becomes HTTP 409. Unknown fields and reserved fields are rejected; create performs a conditional `PutItem`, so duplicate IDs cannot overwrite records. No delete operation is implemented.

## Important remaining implementation work

1. Validate teacher and venue foreign-key existence before class/event changes; add high-level transaction guards if concurrent referential mutation is possible.
2. Define server-side ownership of metadata (`createdAt`, `updatedAt`, `version`, `createdBy`) rather than allowing the request body to supply metadata.
3. Tighten write schemas and data model validation for actual class and event API fields; `nameSort` needs consistent derivation.
4. Implement purpose-built workflows for guardian access, family records, website registration, attendance, homework, counters, notifications and append-only audit; avoid generic API writes.
5. Verify IAM and route authorisation, staging tests, multi-table transactions, seeding, data migration and a rollback plan before enabling either flag.
6. Confirm Lambda path dispatch and HTTP gateway routing with existing endpoint tests. Do not deploy until integration reviews pass.

## Local verification caveat

The source archive's `node_modules` is incomplete (the tsx and TypeScript packages are only partially present), so the new TypeScript test suite could not run in the packaging environment. Run the commands above against the repository's installed dependencies. Do not treat these writes as production ready.
