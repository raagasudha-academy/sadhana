# M9 homework storage patch — 2026-11-03

## Scope
This is a local source patch for the already-provisioned M9 homework and submissions DynamoDB tables. No migration of discarded historical homework data is necessary. The API URLs and JSON envelopes remain compatible for the following methods:

- `GET/POST /homework/:classId`
- `PUT /homework/:classId/:homeworkId`
- `GET /homework/:classId/submissions/:homeworkId`
- `POST /homework/:classId/feedback/:homeworkId/:studentId`
- `GET/POST /learner/:studentId/homework`
- `GET/PUT /learner/:studentId/submission/:homeworkId`

All require `?institution=raaga` or `?institution=sruti` and verified Cognito authorisation. Assignments use `sadhana-dev-m9-homework`, learner responses use `sadhana-dev-m9-submissions`, and audit writes use `sadhana-dev-m9-audit`. Enrolments, class membership, teacher assignment, guardian link approval and Cognito identity are checked at the M9 tables; mutable access is rechecked transactionally.

## Flags (isolated test Lambda only)
Set `M9_HOMEWORK_WRITES=enabled` AND `M9_STRICT_DATA_FENCE=enabled`. Keep the original live Lambda's M9 flags disabled. Do not enable this flag in production before real authenticated cross-institution and guardian-revocation tests.

## Known gaps (intentionally blocked)
Evidence uploads/downloads and teacher-provided homework materials remain blocked with HTTP 503 because the existing S3 metadata routes still use the legacy student table. `saveSubmission` rejects nonempty `attachmentIds`. Do not enable legacy fallback to work around this. The existing media rules are image-only and differ from the agreed final requirements (max 2 images, 5MB each; MP3/M4A up to 20MB; MP4 up to 100MB). These paths must be implemented and tested in M9 before full cutover.

Other full M9 go-live blockers remain: tested Cognito invitations, Guardian lifecycle, both website registration paths, cross-institution negative-auth tests, and rollback rehearsal. This patch does not deploy anything or mark cutover ready. As the source audit reports, other old learning route implementations still exist for the legacy API.

## Local check
From `~/Dev/sadhana/backend`, run:

```
node --test test/homeworkFence.test.mjs test/homeworkSource.test.mjs test/cutoverFence.test.mjs test/cutoverGapAudit.test.mjs test/learnerWriteRules.test.mjs
npm run check
npm run build
node scripts/cutoverGapAudit.mjs --report ./m9-integration-gaps-v2.json
```

The first five tests passed locally (36 tests). TypeScript and esbuild could not run in the packaging environment because backend npm dependencies are not installed; run on developer Mac and share any errors.
