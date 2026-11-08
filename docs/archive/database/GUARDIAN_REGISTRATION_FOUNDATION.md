# M9.5 Guardian & Registration — Safe Integration Foundation

M9 `family-links`, `people`, `families`, `registrations`, and `audit` are separate physical tables. This patch adds explicit M9-only endpoints; the legacy `/family-access` and `/website-registrations` remain unchanged and authoritative.

**Disabled by default:** `M95_ONBOARDING_MODE=enabled` is required. Do not enable on deployed Lambda until IAM, account identity provisioning, web import transactions and rollback are tested. Existing pilot's global mutation guard also blocks these POST endpoints if `M95_COMPAT_MODE=pilot`.

Routes:
- `GET /m9-onboarding/status?institution=raaga` (academy admin)
- `GET /m9-onboarding/registrations?institution=raaga` (academy admin, internal metadata only; does not list the website's external registration table)
- `POST /m9-onboarding/guardian/request?institution=raaga` (authenticated parent with exactly one existing mapped M9 person and existing M9 child/family; creates PENDING, never APPROVED)
- `POST /m9-onboarding/guardian/decision?institution=raaga` (academy admin, independent relationship verification evidence, optimistic version and transactional audit; never self-approve)

The new M9 student and guardian People records are NOT yet populated, so guardian requests will correctly fail closed until the onboarding identity/import implementation exists. The existing registration/import/guardian workflow must remain active.

Deferred by design: end-to-end website approval/import and idempotent family/student/roll-number creation; Cognito provisioning; account access queue listing / resend / re-request; revocation integration and cross-service compensation. Do **not** switch the existing routes to these M9 endpoints yet.

## Local installation
```
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m95-guardian-registration.zip -d .
python3 apply_m95_onboarding.py
cd backend
node --import tsx --test test/guardianRegistration.test.ts
npm run typecheck && npm run check && npm run build
```

No database schema changes or AWS writes occur during install or tests. No AWS deployments or GitHub pushes are performed.
