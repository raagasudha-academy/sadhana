# M9 — approved legacy website registration bridge

This patch addresses an approved Raagasudha registration that has ALREADY been imported by the existing Sadhana portal, but is absent in M9. It DOES NOT import from legacy Sadhana DynamoDB tables, change the website's existing import mapping, provision Cognito accounts or approve family links.

Prerequisites: current source patched, `npm run check && npm run build` passing, administrator JWT for Raagasudha, registered website ID matching `RS-*`, isolated Lambda only. The existing 18 M9 tables are reused, with their existing data and counters retained. Only run on disposable/approved records whose source mapping matches the legacy portal.

1. `python3 scripts/bridgeDeploy.py` — dry-run only.
2. `python3 scripts/bridgeDeploy.py --execute` — **AWS writes**: updates only the isolated Lambda, its IAM role and safe M9 bridge feature flags. Legacy table permissions are not added. Cognito provisioning, account-link writes and website mapping updates stay disabled.
3. With a valid Raagasudha admin access token stored locally, call:

```
BASE=https://y3eobn1ppi.execute-api.us-east-1.amazonaws.com/m9-test/api
read -rs 'TOKEN?JWT: '; echo
read 'REG?Approved website registration ID (RS-...): '
curl -sS -i -X POST -H "Authorization: Bearer $TOKEN" "$BASE/m9-onboarding/legacy-bridge/$REG/preview?institution=raaga"
```

Preview must show `legacyBridge: true`, `studentCount`, `pendingGuardianLinks` and `guardianApprovalPending: true`. If the source mapping doesn't match exactly, it returns 409 and no writes.

4. Only after reviewing the preview, execute the M9-only transaction:

```
curl -sS -i -X POST -H "Authorization: Bearer $TOKEN" "$BASE/m9-onboarding/legacy-bridge/$REG/execute?institution=raaga"
unset TOKEN REG
```

The result returns M9 *internal* student IDs. Use those internal IDs (not `001-001`, the roll number) with `/learner/{studentId}/dashboard`. Expect 403 until an existing **verified** Cognito identity is linked through its separately gated reviewed workflow, and guardian links receive an independent approval decision. This is intentional. Enrolments require a separate approved class association; the bridge does not invent enrolments.

**Do not run** the M9 website sync endpoint on bridged records. It now rejects bridged records as legacy-authoritative. Never enable `M95_WEBSITE_SYNC_WRITES` for this bridge. Repeat `/execute` returns the existing M9 registration rather than duplicating people.

Production API is not cut over. After tests, disable `M9_LEGACY_BRIDGE_WRITES` and `M95_ONBOARDING_MODE` on the isolated Lambda using a controlled configuration update. This patch does not approve full cutover.
