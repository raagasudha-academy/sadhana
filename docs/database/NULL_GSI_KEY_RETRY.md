# M9.5 DynamoDB NULL GSI key repair

The initial selective operational transfer can stop if a transformed item contains `seriesId: null` while `SeriesOccurrencesIndex` expects a String. This repair removes only explicit NULL values on DynamoDB GSI key fields **at the transfer boundary**, before hashing and writing; it preserves all other optional NULL attributes and the full `legacyPayload`.

Files changed:
- `backend/scripts/operationalTransferCore.mjs`
- `backend/test/operationalTransfer.test.mjs`

Apply to the repository root, run:

```bash
cd ~/Dev/sadhana/backend
node --test test/operationalTransfer.test.mjs
npm run typecheck
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
node scripts/transferOperational.mjs --dry-run --report ./transfer-dry-run-fixed.json
```

**Review `alreadyTransferred`**: it might be greater than zero because the prior execution failed after some successful writes. It must not report unexpected or modified target items; `readyForExecute` must be `true`.

Only then retry with a new report filename:

```bash
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
node scripts/transferOperational.mjs --execute --ack-operational-only \
  --report ./transfer-execution-fixed.json
```

Expected `verifiedTotal: 461`. `writesPerformed` may be lower than 461 on retry. This retry never deletes, clears, or overwrites existing records. Historical audit records, student and learning records and original five tables stay untouched. No API cutover occurs.

If the dry run stops with an unexpected/modified destination item, **do not clear tables**; review that error first.
