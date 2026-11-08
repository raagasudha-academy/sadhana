# M9 Guardian Identity Link — isolated deployment patch

Modified files:
- backend/src/verifiedCognitoLink.ts
- backend/src/routes/guardianRegistrationRoutes.ts
- backend/src/guardianRegistration.ts
- backend/test/verifiedCognitoLink.test.ts
- backend/test/guardianRegistration.test.ts

## Changes
- Require `expectedCognitoSub` in both protected `/m9-onboarding/verified-account/<m9RegistrationId>/preview` and `/link` POST JSON bodies. Never accept the email match alone as an account selection.
- Require a Cognito account that is ENABLED and CONFIRMED, with email_verified=true, verified email equal to imported guardian email, and subject equal to the administrator-selected subject.
- Reuse importer canonical guardianLinkId in guardian decisions and requests.
- Guardian approval demands active guardian, matching family and institution, and linked Cognito subject. Approval remains separate, administrator-only, independently evidenced and audited.
- Add regression cases for missing/mismatched selected subject and unlinked guardian refusal.

## No operational actions performed
No AWS resource was changed, no DynamoDB item modified, no account created, and no guardian-child relationship approved. Do not turn on write switches until authorization, IAM and dry-run checks are confirmed.

## Local application
Unzip from project root with: `unzip -o ~/Downloads/sadhana-m9-guardian-link-patch.zip -d ~/Dev/sadhana`
Then: `cd ~/Dev/sadhana/backend && npm ci && npm run check && npm run build`
Additional M9 `.mjs` tests: `node --test test/*.test.mjs`

## Required safe live rollout
1. Confirm isolated Lambda API JWT authorizer, M95_ONBOARDING_MODE=enabled and M9_STRICT_DATA_FENCE=enabled.
2. Confirm isolated Lambda IAM has Cognito ListUsers scoped to user pool, and DynamoDB transaction writes to `people`, `counters`, `registrations`, `audit`, and `family-links` only as required. Preserve legacy-deny fence. This package does not alter IAM.
3. Deploy *only* isolated Lambda via a reviewed update-function-code step. Verify observed artifact hash and endpoint auth before enabling link writes.
4. Run protected preview with a legitimately signed-in raaga administrator and selected verified Cognito subject; no tokens in chat.
5. Enable M9_VERIFIED_IDENTITY_LINK_WRITES=enabled only for isolated testing. Invoke link, re-run preview and review person + uniqueness guard + audit.
6. Independently verify relationship evidence for both child IDs and approve each with current expectedVersion via protected guardian/decision endpoint. Do not modify family-links directly.
7. Test guardian dashboards with the parent session. Confirm denied access to unrelated Raaga and Sruti students. Disable link write switch again after verification.

Caution: the isolated role as originally provisioned does not include people/counters/registrations/family-links writes or Cognito ListUsers; those permissions require a separately reviewed infrastructure update before an actual link or approval can succeed.
