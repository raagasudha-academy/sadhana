# Sadhana M9.1 — Sruti intake + reviewed import (isolated-first)

This is a SOURCE PATCH, not a deployed endpoint. The existing 18 DynamoDB tables are reused. No new tables, credentials, user accounts, auto-approval, or production routing changes are included.

## Scope

- `m91SrutiIntakeCore.mjs`: input validation and translation of all three Sruti form modes (`self`, `child`, `both`) to the established M9 website import planner.
- `m91SrutiIntakePublic.ts`: separate **public** Lambda handler. Disabled by default (`M91_SRUTI_PUBLIC_INTAKE`), accepts only `POST` from approved web origins via CORS, caps request size, rejects photos, and stores `pending` intake records in the M9 **registrations** table. CORS is NOT authentication or bot protection.
- `m95GuardianRegistrationRoutes.ts`: Sruti-admin-only `GET /m9-onboarding/sruti-intake/{SR-id}?institution=sruti` and `PATCH /m9-onboarding/sruti-intake/{SR-id}/review?institution=sruti`, with optimistic versioning and opt-in writes (`M91_SRUTI_REVIEW_WRITES`).
- `m95WebsiteImport.ts`: the existing protected `POST /m9-onboarding/website-import/{SR-id}/preview|execute?institution=sruti` can now read only Sruti-approved internal intake records; still prevents duplicate families and uses the same atomic counters/people/links transaction. `M95_WEBSITE_IMPORT_WRITES` remains the execute gate.
- `m95WebsiteImportCore.mjs`: preserves Sruti learning details in student profiles. Guardian links remain **pending** and **unverified**. No Cognito provisioning is performed.

## Local verification

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m91-sruti-integration.zip -d .
cd backend
node --test test/m91SrutiIntakeCore.test.mjs test/m95WebsiteImport.test.mjs test/m95WebsiteSync.test.mjs
npm run check
npm run build
npx esbuild src/m91SrutiIntakePublic.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/m91-sruti-intake.mjs --external:@aws-sdk/*
```

Do **not** deploy the public handler to the existing JWT-protected isolated API as-is. It needs a **distinct public API Gateway route**, isolated least-privilege IAM limited to `dynamodb:PutItem` on `sadhana-dev-m9-registrations`, route throttling, WAF/bot protection, request-size limits, audit/log-retention/privacy review and TLS/CORS validation. Keep `M91_SRUTI_PUBLIC_INTAKE=disabled` until those checks pass. Public deployment should first be tested on a non-production Sruti staging origin.

Do **not** set `VITE_SRUTI_REGISTRATION_API_URL` on GitHub Pages until the separate public endpoint is verified. The existing website form remains a non-submitting preview until then.

The authenticated review API requires a **Sruti admin** access token. Typical manual lifecycle after verified deployment:

1. Public POST creates a `SR-...` record, `reviewStatus=pending`.
2. Admin GET obtains record and its `version`.
3. Admin reviews original submission and PATCHes `{ "reviewStatus":"approved", "expectedVersion":1 }` with `M91_SRUTI_REVIEW_WRITES=enabled` on the isolated Lambda.
4. Admin previews website import, then explicitly executes it under `M95_WEBSITE_IMPORT_WRITES=enabled`. Approval does not imply identity linking or child access.
5. Separately verify Cognito identity, guardian-child relationships, and learner permissions, as for Raagasudha. Never reuse the Raagasudha admin identity or automatically approve Sruti family access.

## Still required for M9.1 cutover

- Deploy and test the new public intake behind rate limiting/bot controls, isolated IAM and a verified website endpoint.
- Execute Sruti E2E including all three modes, duplicates, rejection and administrator review/import.
- Verify invitation, revocation, audio/video media E2E, full cross-institution security and rollback rehearsal.
- Keep production API unchanged. The strict legacy fence stays enabled. **NO-GO** until all deployed acceptance evidence passes.
