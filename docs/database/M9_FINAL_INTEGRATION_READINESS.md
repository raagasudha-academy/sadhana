# M9 — Final integration checkpoint (local-only)

## What this patch actually adds

- M9 `GET /learner/{studentId}/dashboard?institution=raaga|sruti` opt-in adapter. It uses the new People, Family Links, Enrolments, Classes, Sessions, Practice, Attendance and RSVP tables. Student and guardian authorization is derived from the JWT's Cognito `sub`, and any guardian access link is re-read with strongly consistent DynamoDB reads before use. It has no writes or media integration.
- M9 onboarding `POST /m9-onboarding/verified-account/{internalM9RegistrationId}/preview?institution=raaga|sruti` and `.../link`. These find **an existing verified Cognito account only** and, if explicitly enabled, atomically bind it to the M9 primary-contact Person, guard the unique subject, record an audit and mark the registration. No account creation, invitation or guardian approval occurs.
- Read-only `m9FinalCutoverReadiness.mjs` AWS audit of all 18 provisioned M9 tables, seed records, basic operational counts, and **explicit unverified end-to-end dependencies**. The report is fail-closed: `fullCutoverReady` is false unless every dependency is independently demonstrated.

## Install

Extract the ZIP at the repository root. Run:

```bash
cd ~/Dev/sadhana/backend
node --test test/m9FinalAccessCore.test.mjs test/m9FinalWiring.test.mjs
npm run typecheck
npm run check
npm run build
```

For a read-only AWS report (no writes; requires DescribeTable, Scan, and GetItem permissions):

```bash
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split SADHANA_TABLE_NAME=sadhana-dev-main \
node scripts/m9FinalCutoverReadiness.mjs --report ./m9-final-readiness.json
```

Generated reports should remain local, excluded from Git.

## Flags — leave disabled in deployed Lambda

- `M9_FINAL_LEARNER_READS=enabled` — selectively replaces only existing `GET /learner/{studentId}/dashboard` with M9 read adapter. It does **not** transfer learner writes or homework access.
- `M95_ONBOARDING_MODE=enabled` — existing opt-in M9 onboarding routes.
- `M9_VERIFIED_IDENTITY_LINK_WRITES=enabled` — existing verified Cognito account binding; required only for the `link` endpoint.

Do **not** enable `M95_COMPAT_MODE=pilot` for normal users. Its global write guard deliberately rejects unsupported routes. The full cutover remains blocked.

## Remaining non-negotiable gaps

1. **Cognito provisioning and invitations:** This patch safely links an existing verified Cognito account but does not create new accounts, send invitations, or provide all parent/student account lifecycle operations on M9.
2. **Website integration:** Raagasudha import/status sync has a guarded implementation; returning-family merges and verified Sruti website intake still need production integration and end-to-end tests.
3. **Learner/guardian workflows:** Only learner dashboard reads gained the M9 adapter. `family-access/mine`, requests, full guardian access screens, profiles, media, homework materials/evidence, attendance/practice/RSVP writes, teacher feedback and enrolment management still need M9 implementations that retain existing response shapes and authorization.
4. **Calendar/admin writes:** Existing M9 write routes are feature-gated pilot slices, not proof of complete deployed compatibility or production IAM.
5. **IAM and rollback:** Lambda execution role needs scoped M9 table/index permissions, Cognito permissions and required S3 access. Both normal and rollback paths need staging-level end-to-end evidence.
6. **Full frontend cutover:** Current screens use legacy API contracts. Only switch after the all-workflow parity suite and rollback drill succeed.

No tables are created or modified by this package. No GitHub push, Lambda deployment or AWS cutover happens automatically.
