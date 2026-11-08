# M9 IAM simulator compatibility fix

AWS IAM `SimulatePrincipalPolicy` now returns one top-level `EvaluationResult` per action. Decisions by requested ARN are in `ResourceSpecificResults`. The previous M9 verifier tried to match top-level `EvalResourceName` against each table ARN, causing all 216 checks to fail despite prior successful per-table simulations.

This patch changes only the read-only verifier parser and adds regression tests. It does not change AWS roles, data, code paths for the Lambda, or any cutover flags.

## Apply and verify

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m9-iam-result-fix.zip -d .
cd backend
node --test test/finalSecurityCore.test.mjs
AWS_PROFILE=default AWS_REGION=us-east-1 node scripts/finalSecurityVerify.mjs \
  --lambda-name sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh \
  --report ./final-security-evidence-v2.json
```

If some checks still fail, inspect `scans` entries by `decision`/`error` instead of assuming the role is denied. `anonymousVerified` remains false without an `--api-base-url`.
