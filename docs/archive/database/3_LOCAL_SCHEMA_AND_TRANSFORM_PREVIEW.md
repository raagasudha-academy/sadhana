# M9.3 local-only schema and transformation preview

## Current phase
- 18 proposed physical DynamoDB tables, simple `entityId` partition keys; no base-table sort keys.
- CloudFormation is **generated locally only**. Do NOT deploy this template yet.
- Read-only scanner operates on five existing split tables and generates a private target-item preview and safe aggregate summary.
- No existing application files (including `src/tableRouter.ts`) are modified by this package.
- No AWS writes, deploy, table provisioning, migrations or GitHub pushes.

## Install
From repository root: `unzip -o ~/Downloads/sadhana-m9-3-local-preview.zip -d .`

## Tests
From `backend/`: `node --test test/migrationPlanner.test.mjs test/schemaAndTransform.test.mjs`

## Infrastructure preview (offline)
`node scripts/infrastructurePreview.mjs ./schema-preview.json`

This creates only a local CloudFormation JSON draft containing the 18 DynamoDB tables, defined GSIs, PAY_PER_REQUEST, PITR, deletion protection and Retain policies. The resulting file must be reviewed before applying because some access patterns are not fully modelled yet.

## Live read-only transformation preview
Run from backend directory:

```sh
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
node scripts/transformationPreview.mjs \
  --summary ./target-summary.json \
  --private-records ./target-private.json
```

It scans source DynamoDB tables using `ScanCommand` and writes two local files with `0600` permissions; `wx` means output paths must not already exist. **Never upload or commit `target-private.json`.** It includes historical audit payloads and staff identity mappings.

Expected baseline if source data is unchanged: 642 source, 635 target items, 0 mapping blockers, 0 transformation failures. These are expectations, not a live verification.

## Explicitly unresolved before AWS provisioning or cutover
1. Convert local start/end dates and times using timezone-aware handling of Europe/London BST/GMT, including DST ambiguity and all-day holidays. Current preview sets UTC `startAt/endAt` to `null` rather than inventing an instant. `deferred.localTimeConversion` counts candidate records.
2. Review schedule series-change items; `changes`, `effectiveFrom` and `effectiveUntil` retained. Don't treat them as complete recurrence series.
3. Design scalable indexed teacher/class and shared venue/institution assignments; DynamoDB indexes cannot index array membership.
4. Review all currently accessed table-router PK/SK patterns and backend API paths before making any changes to the router or repository layer.
5. Define identity, permissions and guardian access models precisely. Teacher `cognitoSub` is not sufficient to replicate administrator authorisation.
6. Decide how existing calendar event semantics, managed events and sync metadata translate to new repositories.
7. Review all GSIs against actual access patterns, their key shapes, and index projection costs. Current manifest is a proposed design, not deployment approval.
8. Add field-level schema validation, cross-reference reconciliation and a migration executor with idempotence, rollback, retry handling and transaction guards in a later approved phase.
9. Decide whether retaining full legacy audit payload in the new table is compliant with data retention/privacy policy; preview contains full original source for diffing only.
10. Existing legacy `sadhana-dev-main` remains untouched.

## Git hygiene
Ignore or locally exclude all `backend/m9-*summary*.json`, `backend/m9-*private*.json`, and `backend/schema-preview.json`. Don't track identity information or raw production dumps.

## Scope
This is the *first, local-only deliverable* of M9.3: definitions and preview, **not a finished migration, deployed infrastructure, or a switched backend.**
