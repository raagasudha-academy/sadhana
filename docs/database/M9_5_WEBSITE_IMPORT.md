# M9.5 Website Registration Import — guarded foundation

## Scope

This is an opt-in M9 import using the existing **Raagasudha server-side, signed website gateway** and an **administrator-approved** registration. It does **not** replace the live `/website-registrations` workflow, does not automatically approve a guardian, does not provision Cognito, does not sync website status and does not enrol students in classes. Sruti source integration must be verified separately; requests for Sruti fail closed.

Endpoints (institution query required):

- `POST /m9-onboarding/website-import/{registrationId}/preview?institution=raaga`
- `POST /m9-onboarding/website-import/{registrationId}/execute?institution=raaga`

Both require `M95_ONBOARDING_MODE=enabled`, a verified Cognito academy administrator, and the approved Raagasudha registration gateway configuration. Execute additionally requires `M95_WEBSITE_IMPORT_WRITES=enabled`. Leave these flags OFF on the deployed Lambda. These endpoints are attached inside the existing M9 onboarding route; do not call a new bare endpoint through API Gateway without checking the current router.

### Behaviour

- Preview makes **read-only** authenticated calls to approved website intake and M9 counters; it creates no records and allocates no numbers.
- Execute performs one DynamoDB transaction: conditional family/people/guardian-link/registration/audit records, uniqueness guards on student name+DOB, and atomic institution-specific family/student counters. A conflict fails closed without partial writes.
- Idempotent source registration ID mapping is deterministic. Repeated requests after a successful import return `alreadyImported`, without allocating numbers again.
- Guardian links start `pending` and `relationshipVerified=false` and must pass the independent existing M9 administrator verification workflow. Website data is not proof of a verified guardian.
- Student allergies, guardian-inherited contact and address, source person identifiers and assigned roll numbers are preserved in the M9 People records.
- No automatic class enrolments: a preferred class is a request, not an authorised academy enrolment.
- No Cognito account provisioning or website status update is performed here. Responses explicitly indicate `externalSyncPending` and `provisioningPending`. **Do not run this execute endpoint against real registrations until the cross-system sync and account provisioning workflow is implemented and tested.**

### Limitations requiring work before production

1. The first slice creates new families only; existing-family matching and independently reviewed reuse remain unresolved. Review existing-family/duplicate identity matching before any real registration execution.
2. Identity guard uses normalized name and DOB; potential preexisting students without those guards need a separate directory check at cutover.
3. The current Raagasudha gateway is institution-specific. A signed Sruti gateway and corresponding schema verification are required.
4. Live admin IAM must include the new table transactions and cross-system sync must be idempotent.
5. M9 family membership and adult self-access rules need end-to-end portal validation, and student-facing API routing is not switched.

### Local verification

```
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m95-website-import.zip -d .
python3 apply_m95_website_import.py
cd backend
node --test test/m95WebsiteImport.test.mjs
npm run typecheck
npm run check
npm run build
```

No AWS provisioning or deployment is required to apply this patch locally. Commit only the new source/test/doc and the modified onboarding route. Do not commit private website export files.
