# M9.5 — Selective operational setup transfer

## Authorised scope

Transfer **only** operational academy setup from the existing five-table development database to the newly provisioned `sadhana-dev-m9-*` database:

- 22 classes → `sadhana-dev-m9-classes`
- 382 class sessions + 32 holidays + 9 effective-dated schedule rules → `sadhana-dev-m9-sessions` (423 records)
- 6 special events → `sadhana-dev-m9-events`
- 3 venues → `sadhana-dev-m9-venues`
- 7 teacher profiles → `sadhana-dev-m9-people`; preserve seven teacher/Cognito subject associations as attributes

Total **461 new operational items**. This is a selective transfer, not a transfer of the entire 642-record source. **Do not copy 174 historical audit events.** Do not copy students, families, registration data, attendance, practice, homework, submissions, or guardian data. Do not delete or modify any source records. Existing Cognito identities are preserved, not created.

The 2 M9 institution records must already exist. This script never changes the live Lambda, feature flags, existing API routing, stack, or Cognito. No automatic API cutover.

## Commands — from `~/Dev/sadhana/backend`

Run tests:

```bash
node --test test/operationalTransfer.test.mjs
npm run typecheck
```

Preview (AWS read access only):

```bash
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
node scripts/transferOperational.mjs --dry-run --report ./transfer-dry-run.json
```

Inspect and ensure `readyForExecute=true`, `selectedRecords=461`, `plannedNewWrites=461` on the first run, `timeResolutionIssues=0` and `referenceBlockers=0`. Confirm both institutions exist, the five M9 target tables are ACTIVE with correct primary keys, and there is no unexpected target data.

Execute *only after checking the preview*:

```bash
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
node scripts/transferOperational.mjs --execute --ack-operational-only --report ./m95-transfer-execution.json
```

Expect `verifiedTotal=461`, with 0 unexpected/modified rows. `writesPerformed` may be lower than 461 on an exact-match retry. If any write fails partway through, rerun the **dry run**; the script permits only byte-equivalent fingerprint-matched items and aborts if any target record is not from this transfer. Do not reset or delete target tables to recover.

## Required follow-up before API cutover

- Verify staff `cognitoSub` maps to the expected 7 Cognito users and admin roles still function.
- Validate class and teacher screens against new entity-table API. Current normal API paths continue using the old five tables.
- **Calendar index caveat:** M9 `sessions` GSIs sort on `startAt`. All-day holidays and effective-dated schedule-change records have no `startAt`, so they are not queryable through those indexes yet. Fix calendar query/read-model compatibility before cutover.
- Validate recurrence, holiday exclusions, changed sessions, venue display and special events against the existing UI.
- Ensure the new Lambda execution IAM role has least-privilege access before enabling any M9 API flags. Do not enable M9 writes or change routing yet.

## Safety

- Exact source-count baseline: calendar 454, admin 14, audit 174, students 0, learning 0.
- AWS source operations are scans only; there is no source `Put`, `Update`, or `Delete`.
- Destinations are strictly whitelisted to five newly provisioned `sadhana-dev-m9-` tables.
- The script verifies institution seeds, ACTIVE status, DynamoDB PK schema, output counts, referential relationships and times.
- Conditional `PutCommand` prevents overwriting a destination key. A restarted execution accepts only an exact previously transferred item.
- M9 execution incurs normal AWS DynamoDB request costs.
- `--report` uses create-new semantics. Choose a fresh name on each retry. These summaries contain counts/fingerprints, not student or staff details; keeping them out of Git is still recommended.
