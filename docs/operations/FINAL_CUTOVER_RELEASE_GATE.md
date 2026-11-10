# Sadhana final-cutover release gate — source review (7 November 2026)

This is an **additive, read-only testing kit**. It does not deploy or change AWS and **does not delete tables**. It is not proof that the database retirement is finished.

## What the provided source establishes
- `backend/src/tableRouter.ts` returns its DynamoDB request unchanged outside split mode. Legacy modules can therefore still target `SADHANA_TABLE_NAME` if reachable.
- Main `backend/src/lambda.ts` invokes final handlers ahead of `finalOnlyGate` and blocks fallback in final mode.
- `backend/src/finalOperationsEnrolmentWrite.mjs` handles DELETE via `endEnrolment`.
- Several final handlers are explicitly behind `SADHANA_FINAL_*` switches and intentionally return HTTP 503 when disabled. Unknown/unmigrated routes also intentionally return 503. Neither source presence nor a running app makes every client method usable.
- `sadhana-m9-isolated-e2e` is still not configured for final mode and references `sadhana-dev-main`. This is a retirement blocker pending independent IAM/runtime evidence.

## Install (from ~/Downloads after downloading kit)
```
cd ~/Dev/sadhana
unzip -oq ~/Downloads/sadhana-final-release-gate.zip -d .
cd backend
node --test test/finalCutoverSafety.test.mjs
cd ..
.venv-aws-test/bin/python backend/scripts/final_route_inventory.py --root . --out ~/Downloads/sadhana-final-route-inventory.json
```

## HTTP smoke: no mutations
Use your actual portal origin. CORS is enforced by API Gateway rather than by the Lambda handler.
```
.venv-aws-test/bin/python backend/scripts/final_live_smoke.py --origin https://YOUR-REAL-PORTAL-ORIGIN --institution sruti
```
Authenticated checks are optional and should be run separately for each role using access tokens stored locally in a permission-restricted file (`chmod 600`). Never paste a token into chat or store it in Git. The script only calls GET and OPTIONS. A status of 403 is only a permitted response for role-specific operations if the given role does not have access; therefore role scenarios need separate expected-access assertions before sign-off.

## Fail-closed readiness
```
.venv-aws-test/bin/python backend/scripts/retirement_readiness.py --report ~/Downloads/sadhana-legacy-retirement-report.json
```
This reports blockers and exits nonzero; it cannot authorise deletion.

## Remaining required for actual retirement
1. Capture a complete route and role matrix (including API calls outside `sadhanaClient.ts`) and run authorised GETs with proper role-specific expectations.
2. Run **isolated, controlled write tests** for POST/PATCH/PUT/DELETE, not against irreplaceable live student data.
3. Verify preflight against the actual production UI origin and headers, at API Gateway.
4. Verify all active writers (including external intake, jobs, WhatsApp/Charu, test Lambdas) have no reads/writes to 24 candidate tables. Disable or migrate any dependent workloads.
5. Perform a real restore of at least the representative backups into **new temporary table names**, inspect keys/items/indexes; do not overwrite a permanent table.
6. Run the full application suite before and after each approved retirement batch. Only delete an individually approved table following separate, explicit authorisation.

**No deletion script is included deliberately.**
