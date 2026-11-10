# M9 learner write implementation — local integration tranche

This patch extends the previously supplied fail-closed M9 data fence with **opt-in** M9-only practice (POST, PATCH) and class RSVP (PUT) routes. It is NOT a complete M9 cutover.

## Feature flags

- `M9_STRICT_DATA_FENCE=enabled` closes unported learner/registration surfaces when testing a dedicated M9 Lambda. **Do not enable in the current shared live Lambda.**
- `M9_FINAL_LEARNER_READS=enabled` enables the M9 dashboard read adapter.
- `M9_LEARNER_WRITES=enabled` enables ONLY `POST /learner/:studentId/practice`, `PATCH /learner/:studentId/practice/:practiceId`, and `PUT /learner/:studentId/rsvp`.

The flags default off. All M9 learner writes use only the M9 `people`, `family-links`, `classes`, `enrolments`, `practice`, `sessions`, `rsvps` and `audit` tables; no legacy PK/SK table writes. Each write reads current Cognito identity and guardian link, checks institution, checks enrolment, and includes conditional authorization checks in its DynamoDB transaction. The practice API limits changes to the seven-day window; RSVP requires an upcoming session. Practice IDs and RSVP IDs are deterministic to prevent concurrent duplicate creation.

## Known limitations and cutover gates

1. Only validation and fence tests have run here. Full TypeScript compilation and end-to-end AWS tests were not run (dependencies are absent in this environment).
2. Practice teacher-review lock currently checks `teacherReviewed` on the practice item, not a separate migrated teacher feedback record. **Do not deploy the practice edit route** until this is reconciled with the live teacher review workflow.
3. Homework authoring/submissions/media and teacher practice comments remain legacy; strict fence still blocks them.
4. The current M9 `enrolments`, `people`, `family-links`, `practice` and `rsvps` tables need realistic isolated test records and integration tests, including concurrent revocation and cross-institution negative cases.
5. Cognito invitation lifecycle, both website registration imports, guardian portal, rollback rehearsal and full deployment security tests remain unverified.
6. No change to IAM, CloudFormation, deployed Lambda or DynamoDB was made. Do not enable M9 cutover.

## Local checks

```bash
cd ~/Dev/sadhana/backend
node --test test/learnerWriteRules.test.mjs test/cutoverFence.test.mjs test/cutoverGapAudit.test.mjs
npm run check
npm run build
```

`M9_LEARNER_WRITES` is an isolated test opt-in, not an authorization substitute or production readiness assertion.
