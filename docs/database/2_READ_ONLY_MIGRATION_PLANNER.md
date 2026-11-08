# M9.2 — Read-only record mapping (proposal, not deployment)

## Scope
Five currently deployed split tables, scanned with DynamoDB Scan only. Expected M8-cleaned baseline: calendar=454, admin=14, audit=174, students=0, learning=0 (642 total). The legacy `sadhana-dev-main`, Cognito, S3 and website registration table are not accessed.

The planner maps 22 master classes to Classes; 382 class sessions, 32 informational holidays and 9 effective-dated series-change rules to Sessions; 6 special events to Events; 3 venues to Venues; 7 teacher registry profiles to People (7 subject-link records merged into those profiles); 174 audit records to Audit. Estimated base target items: **635** if all keys validate and no other mapping requirements arise.

**Important:** existing effective-dated series-change rules are not complete recurrence definitions. Preserve `changes`, `effectiveFrom`, `effectiveUntil`, and master class associations. `special-event` entries must preserve `managedEvent`, `eventKind`, shared-event and sync metadata. Holidays are informational (`affectsClasses=false` where present), not class cancellations. `date`, `startTime`, `endDate`, `endTime`, `timezone` are not interchangeable with UTC timestamps without timezone-aware conversion.

## Run, from repository root

```bash
cd backend
node --test test/migrationPlanner.test.mjs
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
  node scripts/migrationPlanner.mjs \
  --summary ./migration-summary.json \
  --plan ./migration-private-plan.json
```

The command refuses to overwrite either file; rename/delete *local generated outputs* if intentionally rerunning. Both files are written with permissions `0600`. Keep both outside commits, especially the **private plan**, which contains AWS source keys, IDs, fingerprints and exceptions. Add them to `.git/info/exclude` if desired.

Exit code: 0 = mappings generated with no blocking findings; 2 = reports generated but blockers found; 1 = argument/AWS/local file error. Review `readyForMappingReview` as a planning signal only: **not** approval for migration or cutover.

For a deliberately changed environment, `--allow-baseline-drift` can omit the strict 642-count check. This never permits writes or removes other validations; do not use it for the initial M9.2 baseline.

## Validation performed

- Strict M8 record counts, including empty student and learning tables
- PK/SK patterns and source IDs for schedules, venues, teachers and audit
- Explicit record-type classification and target key collision detection
- Session-to-master class references, effective-dated series-rule class references, referenced venue IDs
- Teacher-sub reverse lookup, matching Cognito subject, duplicate registry identity
- Missing teacher references raised as warnings for manual assessment
- Source item SHA-256 fingerprints for a later drift comparison; no live change verification/cutover yet

## Not yet validated

- Full transformed DynamoDB item shape (this is a *mapping plan*, not a migration transform)
- Proper projection of teacher-to-class / shared venue index records and index definitions
- Exact local-time-to-UTC conversion, recurrence projection, or shared-event mirrored records
- Actual Cognito existence, permissions/claims, website state or S3 object references
- Feature-level authorisation, transactional guards, retry/idempotency, end-to-end regression tests
- Source mutation after the scan (the five scans are not one atomic snapshot)

Never provision M9 tables or switch production routing based solely on this report. Run detailed transformation tests and a second live source reconciliation immediately before controlled cutover.

## Audit key collision correction (M9.2 patch)
Historical audit `id` values are not guaranteed globally unique; the first live run reported 13 `DUPLICATE_TARGET_KEY` blockers and mapped 161/174 audit events. The planner now derives **every** proposed audit primary key deterministically from the full legacy `(PK, SK)` source key using SHA-256 with an `AUD-` prefix. This preserves distinct events across institutions and repeated legacy IDs. Each mapping retains `legacyAuditId` (if any), the source key and source hash; the eventual transform must preserve the full legacy event payload and historical timestamp. This patch only changes the planner's proposed audit destination key; it neither edits AWS records nor performs an actual migration. Duplicate *source* keys still block.

The planner uses exclusive-create local output flags (`wx`). To rerun after applying the patch, use **new output file names** (for example `migration-summary-v2.json` and `migration-private-plan-v2.json`) without deleting the earlier reports. Keep both out of Git. If 13 collisions were only repeated legacy audit IDs, the expected result is 174 mapped audits, 642 mapped source records and 635 estimated target items. Other blockers may remain and must be investigated.
