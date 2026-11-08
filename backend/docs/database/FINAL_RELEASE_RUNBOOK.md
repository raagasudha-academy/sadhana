# Sadhana M9 final integration & controlled cutover

**Status: NOT EXECUTED / NO-GO** until all deployed workflow evidence is recorded and reviewed.

## Already evidenced by operator (3 Nov 2026)
- All 18 new M9 tables exist; 461 transferred operational records and data parity verified.
- Existing Lambda role IAM simulation: 216/216 allowed.
- Anonymous and deliberately invalid-token API request checks passed on `/dev/api/...`.
- Local backend: 263 tests passed; esbuild produced `dist/lambda.mjs` (882.5 KB).

These are **not** evidence of live M9 media uploads, student workflow correctness, institution isolation, Cognito provisioning or rollback.

## 1. Local source & test freeze

Run from `~/Dev/sadhana/backend`:

```
npm run check && npm run build
node --test test/cutoverGate.test.mjs
sha256sum dist/lambda.mjs    # on macOS use: shasum -a 256 dist/lambda.mjs
git status --short
git rev-parse HEAD
```

Commit the tested changes on the user's branch before deployment. Do not assume a ZIP overlay is recorded in Git. The patch here is a preflight package, not a production deployment.

## 2. AWS preflight (read-only)

```
AWS_PROFILE=default AWS_REGION=us-east-1 node scripts/legacyCutoverPreflight.mjs \
  --lambda-name sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh \
  --api-id 6n9clqr224 \
  --report ./legacy-cutover-preflight.json
```

The currently deployed Lambda may legitimately lack new M9 environment values; the preflight will mark S3 and other gaps instead of assuming they are configured. **Do not add flags to the existing live Lambda merely to turn preflight green**. S3 IAM simulation is indicative only; actual object operations need the isolated test Lambda.

## 3. Isolated M9 deployment — mandatory, not automated by these scripts

Build a *separate* Lambda function and separate `/m9-test` API stage or API Gateway with its own JWT authorizer and IAM role. Do not update the current `sadhana-dev` API integration. Use the tested `dist/lambda.mjs`, same source commit, independent environment/role and private S3 access. Set strict M9 fence to enabled **only on the isolated test Lambda**, and explicitly enable the tested M9 learners, homework, onboarding and other module gates required by the tests. Fail closed for routes still bound to the old repository.

Ensure the test routes reject unauthenticated/invalid JWTs at 401/403 and preserve role checks. Use disposable test identities and registrations; protect the 461 operational records and original source tables. No direct production cutover before end-to-end evidence exists.

## 4. End-to-end acceptance matrix

Check with dedicated Raaga and Sruti administrator, teacher, guardian and student Cognito accounts and distinct enrolments. Save redacted request IDs, timestamps, status codes and relevant screenshots in a private release evidence folder. For each workflow, demonstrate both the expected success and explicit access denials:

1. `isolatedM9Deployment` — exact release digest, isolated API URL, JWT validation, isolated role and env flags recorded.
2. `mediaUploadDownload` — 2 images (5 MB each), MP3/M4A (20 MB), MP4 (100 MB); reject oversized/wrong types; S3 object exists, metadata stays in M9 submissions, guardian and teacher can access only authorised links; revoked access denied; signed URL expiry checked.
3. `cognitoInvitationsOnM9` — invitation provisioning, resend/recovery and verified identity link, separate academy coverage; no account takeover.
4. `guardianPortalEndToEnd` — independent admin approval, correct linked children and access after revocation, including denied cross-family access.
5. `raagaWebsiteE2E` — website submit → review → approval → idempotent import → portal access; verify website status.
6. `srutiWebsiteE2E` — identical for Sruti, including child/self/both registration paths.
7. `learnerHomeworkEndToEnd` — teacher publish/edit → enrolled learner reads → practice/RSVP → submission+media → feedback; non-enrolled learner denied; verify only M9 tables receive records.
8. `crossAcademyNegativeAuth` — Raaga token cannot read/change Sruti data and vice versa on every sensitive endpoint; teacher/guardian/learner role crossover rejected.
9. `rollbackRehearsal` — in isolated environment, switch new traffic back to old code/routing, verify existing live API remained accessible; document treatment of M9-only writes, no record loss, recovery and reconciliation steps.
10. `infrastructureIAMAsCode` — put the M9 table+index+media permissions into versioned CloudFormation/SAM/CDK, resolve manually attached inline-policy drift, deploy & retest in isolation.

## 5. Final evidence gate

Copy `cutover-evidence.template.json` to an evidence file and fill each workflow with `passed: true` **only** after real testing, accompanied by a descriptive evidence reference (>=12 characters); insert the complete JSON content of `legacy-cutover-preflight.json` under `preflight`. Then run:

```
node scripts/cutoverGate.mjs \
  --evidence ./m9-cutover-evidence.json \
  --report ./m9-cutover-gate-report.json
```

This checks that evidence has been entered; it cannot independently validate evidence authenticity. An authorised human must review evidence, approve routing, schedule a change window and execute a separately prepared rollback-capable deployment. **The gate never deploys or switches traffic**.

## 6. Cutover policy

- Keep existing API `https://6n9clqr224.execute-api.us-east-1.amazonaws.com/dev/api` authoritative until all tests, data reconciliation and reversal have passed.
- Do not delete legacy tables, disable PITR, or remove audit records during cutover.
- New writes during pilot complicate rollback: define replay/reconciliation before accepting production user input into M9.
- Prefer an explicit staged traffic switch with telemetry/alarms over replacing the live Lambda in place.
- Post-switch verify registrations, timetable, guardians, students, uploads and denied cross-academy requests; if any critical acceptance fails, stop routing to new code and reconcile before resumption.
