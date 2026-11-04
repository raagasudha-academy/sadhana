# M9.1 private learner homework evidence — isolated integration

## Scope

M9-specific signed PUT/GET for learner homework submission evidence:
- Maximum **2 images**, 5,000,000 bytes each (JPEG, PNG, WebP)
- Maximum **1 audio**, 20,000,000 bytes (MP3 or M4A)
- Maximum **1 MP4 video**, 100,000,000 bytes
- An attachment is a private S3 object plus a conditional, institution/student/homework-bound receipt in **existing M9 submissions table**.
- Presigned upload URLs expire after 5 minutes and download URLs after 3 minutes.
- A successful S3 HEAD metadata/length check is required before receipt becomes ready.
- Submissions only accept ready receipts bound to that learner/assignment; teacher downloads require staff class access and a submitted response.
- No new tables, no legacy PK/SK fallback, no Cognito provisioning, no change to guardian links or enrolments.

**This patch does not migrate teacher-authored assignment materials** (their old `/materials` routes stay blocked); it migrates **student submission evidence**. It does not change AWS or enable the new `M9_HOMEWORK_MEDIA` flag by itself. Existing M9 test records are retained.

## Apply locally

From `~/Dev/sadhana`:

```bash
unzip -o ~/Downloads/sadhana-m91-media-patch.zip -d ~/Dev/sadhana
cd backend
node --test test/m91MediaPolicy.test.mjs test/m9HomeworkFence.test.mjs test/m9HomeworkSource.test.mjs
npm run check
npm run build
python3 scripts/m91MediaPreflight.py
```

The preflight will deliberately show `mediaFeatureOptIn: false` until the isolated Lambda is updated with the new code and *only then* configured with `M9_HOMEWORK_MEDIA=enabled`. **Do not turn on this flag before deploying the matching code.**

## Controlled deployment requirements

1. Verify local TypeScript checks/build, isolated Lambda ARN, code SHA and strict fence. Use your previously verified guarded `m9_update_isolated.py` code-only deploy command; do not touch production.
2. Verify the S3 bucket is private, encrypted, and browser PUT CORS permits `Content-Type` and the four `x-amz-meta-*` request headers from the frontend origin. The preflight checks basic PUT CORS, but not origin matching.
3. Verify the Lambda role permits `s3:PutObject`, `s3:GetObject` (HEAD uses GetObject) for the private bucket prefix; verify DynamoDB `PutItem`/`UpdateItem` and `ConditionCheckItem` permissions on `sadhana-dev-m9-submissions` and `GetItem` permissions. Existing policy is expected to cover this; run IAM audit again.
4. Enable `M9_HOMEWORK_MEDIA=enabled` **only on the isolated Lambda** through a guarded configuration update preserving all existing environment variables. Until then requests are rejected.
5. With a *new, unreviewed* assignment (the earlier text E2E assignment has already been reviewed), run with a real parent token: start upload -> PUT exact signed headers/body -> finish -> save submission with receipt ID -> GET signed links as parent and assigned teacher. Negative tests: other student, unrelated institution, stale/revoked guardian, wrong size/metadata, >2 images, >1 audio, >1 video, unknown receipt and legacy material endpoints.
6. Disable media flag on any unexpected behavior; preserve strict fence. Do not mark production cutover ready without deployed E2E evidence and rollback.

## API path compatibility

The existing web client uses the same paths as before:

```
POST /learner/{student}/submission/{homework}/evidence/start
POST /learner/{student}/submission/{homework}/evidence/finish
GET  /learner/{student}/submission/{homework}/evidence
GET  /homework/{class}/evidence/{homework}/{student}
```

The `start` response includes `key` containing an opaque MEDIA ID, upload URL and signed headers; `finish` accepts `{ "key": "MEDIA-..." }` and returns `{ "attachmentId": "MEDIA-..." }`. The browser uploads directly to S3 using the signed headers.

## Current validation

Node policy, fence, source security tests can execute without third-party packages; full TypeScript/test/build and deployed AWS checks must be run in the Mac repository. No AWS writes were performed in preparing this patch.
