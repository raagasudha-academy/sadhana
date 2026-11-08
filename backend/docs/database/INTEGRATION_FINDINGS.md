# M9 source integration findings — 2026-11-03

## Established externally (user-run evidence)

* 18 DynamoDB M9 tables active; 461 selected operational records transferred.
* 216 DynamoDB IAM policy simulations allowed, 0 denied.
* API Gateway `/dev/api/...` returns expected anonymous/invalid-token denials; `anonymousVerified: true`.
* These checks do **not** verify signed-in role authorisation or application mutations.

## Confirmed by supplied source

* `src/finalLearner.ts` implements a gated learner dashboard read from M9 tables, with Cognito-subject identity lookup and strongly re-read approved guardian links.
* `src/routes/learningRoutes.ts` still uses PK/SK-era services for practice, homework, submissions, profile updates, media and RSVP writes. These have **not** been migrated in this patch.
* `src/routes/guardianRegistrationRoutes.ts` contains optional M9 guardian request, decision, preview/import, and verified-account linking routes. Existence alone does **not** prove live invitation or website workflows.
* The supplied ZIP has no infrastructure template, so the manually created AWS inline IAM policies cannot be safely incorporated into infrastructure-as-code using this source alone.

## Changes in this package

* Added an **opt-in** legacy learner/registration route fence, `M9_STRICT_DATA_FENCE=enabled`. It returns HTTP 503 on unported learner and administrative data-domain routes, rather than accidentally reading or writing old PK/SK tables. Keep **disabled** on the existing operational Lambda; enabling it there will intentionally interrupt unported paths.
* Preserved the independently gated M9 dashboard route and optional M9 onboarding routes.
* Added regression tests and a source-only gap audit that intentionally refuses to claim deployment readiness.

## Remaining six deployed workstreams — NO-GO

1. Cognito invitations on M9: real provisioning, delivery, acceptance, revoke/reinvite and subject linking, in isolated test environment.
2. Guardian portal: request, independent admin approval, verified family link, correct child access, revoke and confirm access removed.
3. Both websites: Sruti and Raagasudha submission, approval, import, status sync and duplicate handling. Prevent production submissions from being marked complete by local-only tests.
4. All learning APIs: implement M9-authorised practice, attendance, homework, materials, submissions, media and RSVP reads/writes, including object-store media permissions and transactional audit.
5. Rollback: isolated alias/stage switch rehearsal, compare before/after, prove no live data loss; never point a test Lambda at operational write tables.
6. Negative authorisation: signed-in Raaga user accessing Sruti records and vice versa, revoked guardian, learner attempting teacher/admin mutations, invalid ownership, expired/invalid tokens.

## Local usage

```sh
node --test test/cutoverFence.test.mjs test/cutoverGapAudit.test.mjs
node scripts/cutoverGapAudit.mjs --report ./integration-gaps.json
```

The audit does not make live AWS calls. Do not set `M9_STRICT_DATA_FENCE=enabled` on the existing live Lambda. Do not enable full cutover; there is no end-to-end proof for the above workflows.
