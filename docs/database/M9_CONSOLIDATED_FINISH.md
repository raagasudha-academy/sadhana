# Sadhana M9 — consolidated integration correction

## What this patch actually completes

- Corrects generic M9 repository reader and writer to target the provisioned `sadhana-{env}-m9-{entity}` namespace (not legacy/nonexistent `sadhana-{env}-{entity}`).
- Extends new M9 website import records with source-person-to-student IDs, explicit pending website sync and Cognito invitation state.
- Introduces a transactionally guarded primary-contact email marker. Returning families **stop for administrator review**; they are NOT automatically merged.
- Provides opt-in M9 website import sync preview and execution, matching the website's exact approved registration and preventing overwrites of a different upstream import.
- Adds new pure and wiring tests; existing M9 guardian links remain pending (not approved on import).

## Install

From `~/Dev/sadhana`:

```bash
unzip -o ~/Downloads/sadhana-m9-consolidated-fix.zip -d .
cd backend
node --test test/m95WebsiteImport.test.mjs test/m95WebsiteSync.test.mjs test/m95ConsolidatedWiring.test.mjs
npm run check
npm run build
```

Do not continue if any of those fail. Review `git diff --check && git diff --stat`. The original five-table API remains the default. No AWS resources are created or modified by installation.

## New opt-in M9 onboarding actions

The backend already exposes `/m9-onboarding/website-import/{registrationId}/preview` and `/execute`. This patch adds:

- `POST /m9-onboarding/website-import/{registrationId}/sync-preview?institution=raaga`
- `POST /m9-onboarding/website-import/{registrationId}/sync?institution=raaga`

Both require verified Raagasudha administrator JWT claims and `M95_ONBOARDING_MODE=enabled`.

The `sync` endpoint additionally requires `M95_WEBSITE_SYNC_WRITES=enabled` and performs an **external website write**. Leave all flags disabled until user acceptance testing, infrastructure IAM and deployment have been approved. `sync-preview` performs GET reads only. Import must have committed to the M9 registration table first; the website must still say approved. If the website shows an unrelated import mapping, synchronisation fails closed.

An upstream website PATCH can succeed while the local acknowledgement fails. Repeating `sync` safely checks the current upstream mapping and acknowledges it. Because this crosses AWS accounts/services, it is **not** a single distributed transaction, and no autonomous retry worker is included.

## Important bounds

This patch is **not a full M9 cutover**. The uploaded source has working calendar parity and multiple guarded API integrations, but these gaps remain:

1. M9 parent Cognito identity provisioning and verified linking are **not wired**; the legacy parent provisioning function relies on the old `OPS#GLOBAL#WEB_IMPORT` marker and cannot be reused unchanged.
2. Existing-family merging is **not wired**; the new primary-contact guard deliberately stops duplicates and requires administrator resolution.
3. Sruti intake is **not verified**; it is explicitly rejected by the Raagasudha-only integration.
4. Student/learner/guardian portal APIs, homework, attendance, practice and RSVP still read/write old PK/SK records in the original split tables.
5. Infrastructure IAM authorisation for M9 reads/writes, frontend integration, shadow comparisons of teacher/venue directories, rollback and controlled deployment are not fully proven.
6. The pilot mode currently has a global write guard and should **not** be switched on in the live Lambda.

Do **not** enable `M95_COMPAT_MODE=pilot` on the deployed Lambda or retire/delete the original five tables. A full switch would strand user workflows even though the operational data has been copied successfully.

## Safe commit

```bash
cd ~/Dev/sadhana
git add backend/src/m9TargetRepository.ts backend/src/m9TargetWriter.ts backend/src/m95WebsiteImport.ts backend/src/m95WebsiteImportCore.mjs backend/src/m95WebsiteImportCore.d.mts backend/src/m95WebsiteSyncCore.mjs backend/src/m95WebsiteSyncCore.d.mts backend/src/routes/m95GuardianRegistrationRoutes.ts backend/test/m9WriteIntegration.test.ts backend/test/m95WebsiteSync.test.mjs backend/test/m95ConsolidatedWiring.test.mjs docs/database/M9_CONSOLIDATED_FINISH.md
git diff --cached --check
git commit -m 'fix: align M9 table namespace and guard website import lifecycle'
```

This package includes no private AWS reports, credentials or user records.
