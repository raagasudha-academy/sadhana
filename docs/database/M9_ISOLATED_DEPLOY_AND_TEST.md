# M9 isolated deployment and cutover validation

## What this package does

Creates a separate test Lambda, a **new** Cognito-JWT-protected HTTP API, and a **separate** IAM role with read-only access to M9 operational tables, write access only to M9 practice/homework/submissions/RSVP/audit, and access to existing private homework media S3. Does not alter or route traffic from the existing Sadhana API (`6n9clqr224`), its Lambda, or legacy DynamoDB tables.

The new Lambda's strict M9 fence blocks legacy learner/family/registration endpoints. The role has **no access to legacy DynamoDB tables**, so any accidental fallback fails. The 461 M9 operational records are **not duplicated**; this is a software isolation deployment, not a separate test-data clone. Only run write tests with disposable identities and disposable records. Never edit or delete the transferred operational classes, sessions, teachers or venues.

**Not a production cutover tool.** Provisioning Cognito users, both website imports, M9 onboarding and parent invitations are *disabled* by default, pending separate safe integration of their external dependencies and restricted IAM permissions. The release remains NO-GO until these and rollback are evidenced.

## On your Mac

From `~/Dev/sadhana/backend` after applying the package:

```sh
npm run check && npm run build
python3 -m unittest discover -s test -p "test_m9_isolated_release.py"
python3 scripts/m9IsolatedDeploy.py --preflight ./m9-cutover-preflight-v3.json
```

The last command is **read-only**. It must find exactly one existing JWT authorizer on current API. If it does not, it refuses deployment rather than creating an insecure public API. It checks AWS account, new-resource name collision, all 18 protected tables, existing successful preflight report, and SHA256 of the local bundle. It avoids copying potentially sensitive environment variables.

If all dry-run checks are correct, **explicitly create isolated resources**:

```sh
python3 scripts/m9IsolatedDeploy.py --execute \
  --preflight ./m9-cutover-preflight-v3.json \
  --report ./m9-isolated-deployment.json
```

This creates the IAM role `sadhana-m9-isolated-e2e-role`, Lambda `sadhana-m9-isolated-e2e`, and API `sadhana-m9-isolated-e2e` with the `m9-test` stage. You should see the new API URL in the deployment report. If a command partially fails, **do not run `--execute` again** until reviewing the created resources; the tool refuses overwriting existing Lambda/role names.

Run **read-only** smoke checks:

```sh
python3 scripts/m9IsolatedSmoke.py \
  --deployment ./m9-isolated-deployment.json \
  --report ./m9-isolated-smoke.json
```

The two initial checks expect `401` or `403` from unauthenticated or invalid-token requests to the new API. These only show authentication rejection, not functional correctness.

For cross-institution checks, provide two **dedicated, single-academy admin test tokens** via environment variables, never paste them into logs or files:

```sh
export M9_RAAGA_ADMIN_TOKEN='...'
export M9_SRUTI_ADMIN_TOKEN='...'
python3 scripts/m9IsolatedSmoke.py --report ./m9-isolated-smoke-auth.json
unset M9_RAAGA_ADMIN_TOKEN M9_SRUTI_ADMIN_TOKEN
```

The script checks positive `/m9/status` and negative `/m9/list/classes` between academies. It never persists tokens in the report. **It does not test guardian/student/teacher-level isolation**.

## Evidence required before the *separate* production cutover

1. Isolated JWT admission and per-institution restrictions, plus more granular teacher/guardian tests.
2. Real homework media upload and download including size/type rejection and signed URL expiration.
3. Cognito new-user invitation/recovery, verified guardian identity and revocation.
4. Raagasudha and Sruti submit → approve → import → student access (including Sruti self/child/both).
5. Learner practice, RSVP, homework, evidence uploads, teacher feedback on disposable M9 records.
6. Automated or documented rollback rehearsal, including M9-only write reconciliation.
7. Version-controlled IAM/CloudFormation for final roles and repeatable production infrastructure. The isolated script is *not* a replacement for production IaC.

Only record each passing result in the `m9-cutover-evidence` gate after a real authenticated deployed test and evidence review. No scripts here switch production routing.

## Known limitations / security boundaries

- Existing Cognito JWT validation issuer and audience are copied from the existing API JWT authorizer, **not** guessed. If the existing API uses a Lambda authorizer instead, stop and explicitly design a verified equivalent.
- `SADHANA_TABLE_NAME` is copied only because the handler constructor requires it. The isolated role cannot access any legacy DynamoDB table. Keep the strict fence enabled.
- M9 read APIs are restricted, not blanket exports. New learner/homework writes may be enabled, but their real endpoint behaviour remains unverified until user-account testing.
- The private media bucket is shared with the current environment; only use disposable test keys and records.
- New resources consume AWS Lambda/API/log charges while present. Cleanup must be planned after testing; never delete M9 operational tables.
- No DNS change, production API deployment or database cutover is performed.
