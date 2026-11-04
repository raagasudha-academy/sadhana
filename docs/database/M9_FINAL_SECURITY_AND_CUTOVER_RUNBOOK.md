# M9 final deployment security and remaining cutover work

## Scope and constraints

This package **does not** switch the Sadhana API, deploy Lambda, change IAM, or write DynamoDB records. It is a read-only verifier built against the latest uploaded backend source and the confirmed 18-table `sadhana-dev-m9-*` layout. The 461 transferred operational records, two institution seeds, and previously validated schedule/directory parity remain separate evidence.

The current running Lambda still routes substantial student, homework, guardian, and registration endpoints through the legacy five-table repository. The M9 opt-in learner dashboard is read-only. The website synchronisation, returning-family handling, Cognito invitations, and learning write paths have **not** been proven end to end in a separate deployed M9 environment. The eight historical readiness blockers must not be marked as resolved without execution evidence.

## Install

From `~/Dev/sadhana`, unpack the ZIP into the repository. Only new scripts, tests and this document are installed. No source files are overwritten.

```
cd ~/Dev/sadhana/backend
node --test test/m9FinalSecurityCore.test.mjs
npm run check
npm run build
```

## Read-only IAM and anonymous authentication probe

The IAM simulator previously returned an invalid-input error when dissimilar DynamoDB actions were grouped. The new runner simulates **one action at a time** across the 18 table resources, then separately across the 18 index resources. It explicitly verifies each requested action and resource is present in the result; missing or denied results fail closed. All supported operations tested are declared in `m9FinalSecurityCore.mjs`.

Use your *actual* API Gateway HTTPS base URL, with the deployed stage if applicable. If omitted, the anonymous-auth check remains unverified. No successful HTTP request is allowed as a negative-auth pass.

```
AWS_PROFILE=default AWS_REGION=us-east-1 node scripts/m9FinalSecurityVerify.mjs \
  --lambda-name sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh \
  --api-base-url 'https://REPLACE_WITH_REAL_API_HOST/REPLACE_WITH_STAGE/' \
  --report ./m9-final-security-evidence.json
```

The report contains AWS account/role identifiers, but no JWTs, secrets, API responses, or raw student data. Keep it untracked. Results are **simulation** rather than proof of successful runtime API calls. IAM grants alone cannot prove permission boundaries such as AWS Organizations SCPs, VPC endpoints, or DynamoDB business-level authorisation.

### If IAM checks fail

Inspect the report's `scans` section for the exact action, table/index and decision. If the failure is `IAM_SIMULATION_ERROR`, inspect `iamError`. Do **not** silently change an IAM policy to grant everything. The two ad hoc role policies previously added through AWS CLI should be incorporated into the repository-managed infrastructure template before further deployment. Preserve the legacy permissions while it remains operational.

## Remaining real deployment integration (not automatically resolvable by this script)

1. Build a parallel M9 staging Lambda/API with matching Cognito authorisation, new table/index IAM, and independent environment flags. Do not repoint the live API before this exists.
2. Execute a new approved Raagasudha registration and a new approved Sruti registration through their genuine website intake flows. Confirm external status sync, idempotent counters, parent and child records, and no premature guardian approval. Verify returning-family reconciliation. Use synthetic test accounts only.
3. Prove Cognito identity/invitation creation and retry, independent guardian review, approved child visibility and immediate revocation with authenticated portal requests (including cross-academy denial).
4. Prove student/learning **write** endpoints, including attendance, practice, homework assignment/submission/review, RSVP and media upload, against M9. Current read-only learner dashboard is not sufficient.
5. Test teacher/class/venue/calendar create/update and shared events through deployed staging API, with conditional versions and audit writes.
6. Verify failed/unauthenticated and cross-institution requests are denied in deployed staging, **not** just mock tests.
7. Perform a deliberate rollback rehearsal on staging: flip the routing mode back, check existing timetable/guardian behaviour, and verify no writes were split across systems.
8. Re-run the independent readiness checker with actual dated evidence; only then schedule a controlled live cutover.

**GO/NO-GO:** NO-GO while any of steps 1–8 is incomplete. No old DynamoDB table should be deleted as part of the cutover.
