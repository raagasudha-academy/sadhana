# M9.5 legacy schedule parity: special events

The original `/schedule?institution=raaga|sruti` included `recordType=special-event` rows in the corresponding `SCHEDULE#...` partition. M9 moved these into its dedicated events table. The M9 compatibility reader now combines class masters, sessions, and special events for `/schedule`, while keeping `managedEvents()` unchanged.

Preflight previously showed 300 old vs 295 M9 records for Raagasudha and 110 vs 109 for Sruti, a discrepancy that exactly matches the 5+1 special events. This patch addresses that omission but **does not guarantee full byte-for-byte parity**: the preflight still compares full record values, so further differences may be reported. It makes no AWS writes and does not enable pilot/cutover.

Apply from the repository root:

```bash
unzip -o ~/Downloads/sadhana-m95-schedule-parity-fix.zip -d .
cd backend
node --import tsx --test test/m95Compatibility.test.ts
npm run typecheck
npm run build
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split SADHANA_TABLE_NAME=sadhana-dev-main node --import tsx scripts/m95CutoverPreflight.mjs --report ./m95-cutover-preflight-v2.json
```

Leave `M95_COMPAT_MODE` off (or shadow), not pilot. Seven additional workflow blockers are expected even if timetable parity passes; they require separate API integration and IAM/rollback verification.
