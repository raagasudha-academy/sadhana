# M9.5 event record-type parity correction

The transferred M9 event record has an `eventId` and `legacyPayload.recordType = "special-event"`, but **no top-level** `recordType`. The previous compatibility adapter incorrectly filtered `events` using the absent top-level attribute. This caused exactly five Raagasudha and one Sruti events to be missing from `/schedule`, even though they were in `sadhana-dev-m9-events`.

The reader now selects events by `legacyPayload.recordType`. No AWS changes, no migration, no old-table modifications, no cutover.

Apply this patch from the repository root, then run:

```sh
cd backend
node --import tsx --test test/m95Compatibility.test.ts
npm run typecheck
npm run check
npm run build
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split SADHANA_TABLE_NAME=sadhana-dev-main node --import tsx scripts/m95CutoverPreflight.mjs --report ./m95-cutover-preflight-v3.json
```

Expected schedule record counts: Raagasudha 300/300, Sruti 110/110, shared 32/32. `same: true` must also be checked; matching counts are not sufficient. Full cutover blockers for remaining workflows are unaffected.
