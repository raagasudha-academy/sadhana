# M9.3 — Referential integrity and target repository, local-only

## Scope

- `referentialIntegrity.mjs`: pure validator for the new target records; detects duplicate primary keys, missing class/venue/teacher links, incorrect institution scopes, duplicate Cognito subject mappings, unresolved session/event times and malformed series changes. Historical audit references to deleted test data are deliberately not treated as missing live entities.
- `referentialPreview.mjs`: reads the *existing local* private M9 transformation JSON; no AWS SDK and no network calls. Produces only aggregate failure/warning codes in a summary.
- `targetRepository.ts`: opt-in **read-only** typed repository for 18 M9 physical target tables. It does not change `tableRouter.ts`, production Lambda, IAM, or make any AWS writes. It is NOT wired into current endpoints. It requires both `enabled: true` and `M9_TARGET_REPOSITORY_ENABLED=read-only` before reads; do not enable before target tables exist.
- `referentialIntegrity.test.mjs`: pure deterministic tests.

## Commands

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m9-3-references-and-reader.zip -d .
cd backend
node --test test/migrationPlanner.test.mjs test/schemaAndTransform.test.mjs test/timezone.test.mjs test/referentialIntegrity.test.mjs
node scripts/referentialPreview.mjs --private-records ./target-private-dst.json --summary ./references-summary.json
cat references-summary.json
```

Use a new summary name if rerunning: the CLI intentionally refuses to overwrite existing summaries. Keep the `target-private-dst.json` file local and excluded from Git. Do **not** upload the private JSON file.

## Reading the result

- `blockerCount=0` means the checks implemented in this phase found no broken references within the provided target preview.
- `INSTITUTIONS_NOT_SEEDED` is an expected warning: two institution configurations are required by the final 18-table solution but were not among the 642 existing retained records.
- The 635-record source-to-target reconciliation remains independent from these relationship checks.
- `readyForIntegrationReview` is **not** a permission to write. No script in this patch executes migrations or provisions tables.

## Limitations and next tasks

- Relationship checking only covers data represented in the local preview and listed FK-like references; it cannot verify currently connected Cognito identities, exact calendar rendering, missing optional associations, or the complete application workflows.
- Physical `sadhana-dev-institutions` records and appropriate staff privileges must be designed before cutover.
- The target schema's *index-level access patterns* still require design checks. In particular teacher-to-many-classes and shared-venue-to-many-institutions cannot be indexed directly through DynamoDB array attributes; use assignment records or dedicated derived keys.
- Some historical class records may refer to a teacher using a display name but no `teacherId`; further source-aware checks are required to ensure those assignments are not lost.
- The experimental reader is intentionally separate from current read/write endpoints and is not a replacement for authorization policies or application-domain repositories. Implement write repositories, IAM policies, role checks, transactional uniqueness, dual-read/rollback strategy, and integration regression tests in a later phase.
- No AWS changes, deployments, GitHub pushes or local source backups.
