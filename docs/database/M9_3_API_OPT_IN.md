# M9.3 — Opt-in target-table API integration (local only)

## Scope
- Adds `backend/src/routes/m9Routes.ts` and connects it into the normal authenticated Lambda handler.
- The existing five-table API routes, storage router and production behaviour are unchanged.
- Unless explicitly set, M9 returns 404. It is READ-ONLY even if enabled; POST/PATCH/DELETE to `/api/m9/...` always return 405.
- This package does not seed institutions, create 18 DynamoDB tables, change AWS IAM, deploy Lambda, or perform migration writes.
- New entity-table reader is opt-in and expects 18 separately deployed tables, so list/record calls fail until infrastructure and IAM are provisioned. This is not a cutover-ready API.

## Local test commands
```sh
cd ~/Dev/sadhana/backend
node --test test/m9MigrationPlanner.test.mjs test/m9SchemaAndTransform.test.mjs test/m9Timezone.test.mjs test/m9ReferentialIntegrity.test.mjs
npm run typecheck
node --import tsx --test test/m9ApiIntegration.test.ts
npm run build
```

## Feature flags
- `M9_API_ENABLED=read-only`: enable the guarded `/api/m9` route; disabled by default.
- `M9_TARGET_REPOSITORY_ENABLED=read-only`: enable the already-built experimental DynamoDB target reader; disabled by default.
- Both flags must be set for actual target table reads. **Do not enable in the deployed Lambda during M9.3.**

## Routes (once the new tables + IAM exist)
- `GET /api/m9/status` — verified staff admin JWT required, returns read-only mode, 18 tables, cutover=false.
- `GET /api/m9/list/classes?institution=raaga&limit=50`
- `GET /api/m9/list/sessions?institution=raaga&limit=50`
- `GET /api/m9/list/events?institution=raaga&limit=50`
- `GET /api/m9/list/registrations?institution=raaga&limit=50`
- `GET /api/m9/list/audit?institution=raaga&limit=50`
- `GET /api/m9/record/classes/{classId}?institution=raaga`
- `GET /api/m9/record/sessions/{sessionId}?institution=raaga`
- `GET /api/m9/record/events/{eventId}?institution=raaga`
- `GET /api/m9/record/venues/{venueId}?institution=raaga`
- `GET /api/m9/record/audit/{auditId}?institution=raaga`

Every endpoint requires verified Cognito claims and administrator membership of the requested institution. Direct record reads additionally check the result's institution scope and answer 404 for mismatches. Private entity lookups (People, families, guardians, learner work) are deliberately not exposed in this generic API; each needs its own subject relationship / access policy. Lists can only query a fixed institution-keyed GSI, never arbitrary data.

## Known next steps
- M9.3: add per-entity validated write repositories with explicit concurrency and uniqueness guarantees, then protected service APIs—not direct generic JSON-to-DynamoDB writes.
- M9.4: provision tables + IAM separately and run zero-write integration tests.
- Complete institution seed / migration reconciliation, then test API cutover with opt-in flag.

No Git operations performed. Existing working tree is retained; install only after reviewing staged diff.
