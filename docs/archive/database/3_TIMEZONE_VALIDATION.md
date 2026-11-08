# M9.3 timezone-safe transformation preview (local-only)

This patch updates the M9.3 transformation preview. It **does not** deploy or write to DynamoDB and does not change the application router.

## Install
From the repository root:

```sh
unzip -o ~/Downloads/sadhana-m9-3-timezone-preview.zip -d .
```

## Run tests
From `backend/`:

```sh
node --test test/migrationPlanner.test.mjs test/schemaAndTransform.test.mjs test/timezone.test.mjs
```

## Preview against AWS (strictly read only)
Use NEW output names; the scanner refuses to overwrite existing private reports:

```sh
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
node scripts/transformationPreview.mjs \
  --summary ./target-summary-dst.json \
  --private-records ./target-private-dst.json

cat ./target-summary-dst.json
```

The `deferred` section now separates `converted`, `allDay`, `ambiguous`, `nonexistent`, `missingTimes`, `invalid`, and `invalidOrder`. `localTimeConversion` counts unresolved conversions rather than all candidate records. No times are inferred when ambiguous or missing.

Timezone conversion uses Node's ICU/IANA timezone data (via Intl). It validates local clock components, rejecting spring-forward gaps and fall-back ambiguities. All-day records retain their date semantics and have no invented UTC instants.

## Important limitations
- An overnight session without a valid end date can appear as `invalidOrder`. It requires business-rule review rather than guessing the next day.
- A special event with no complete local start/end data remains unresolved.
- `readyForWrites` and `canExecute` remain **false**; this validates neither backend integration nor full referential integrity.
- The `target-private-dst.json` report contains operational data: never commit or share it.
- Historic calendar data, seven staff identities, 174 audit records, and the legacy main table remain unchanged.
