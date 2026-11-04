# M9 — deployed evidence (read-only)

The M9 database has 18 tables and the academy operational setup has 461 items. This runner does not deploy, write to DynamoDB, change Lambda configuration, or enable cutover. The original five-table API remains in service.

## Run

From `~/Dev/sadhana/backend`:

```bash
node --test test/m9DeployedEvidence.test.mjs
AWS_PROFILE=default AWS_REGION=us-east-1 node scripts/m9DeployedEvidence.mjs \
  --lambda-name sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh \
  --report ./m9-deployed-evidence.json
```

For a public API authentication smoke test, provide the actual HTTPS API base URL and correct authenticated route prefix. The test issues only two unauthenticated GET requests:

```bash
AWS_PROFILE=default AWS_REGION=us-east-1 node scripts/m9DeployedEvidence.mjs \
  --lambda-name sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh \
  --api-base-url 'https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/' \
  --probe-path '/schedule?institution=raaga' \
  --report ./m9-deployed-evidence-with-api.json
```

For any API Gateway stage/path differences, choose a safe existing GET endpoint. Neither a 404 nor a network failure counts as successful negative-auth evidence. Do not supply real access tokens to this tool.

Reports are written with mode `0600` and intentionally include the AWS account number and Lambda role ARN. **Keep local and untracked**; use `.git/info/exclude`.

## Interpretation

- `infrastructureObserved`: all 18 M9 tables are active, protected, and indexes active.
- `pitrObserved`: point-in-time recovery is enabled for every table. Merely having deletion protection does not establish PITR.
- `lambdaIdentityObserved`: the function and its execution role were read from AWS.
- `iamSimulationObserved`: IAM role simulation allowed the requested table actions. Simulation alone does not prove real AWS access and does not check all index permissions, SCP effects, service-side or application checks. IAM read access to simulate may itself be denied.
- `negativeAuthSmokeObserved`: two unauthenticated GET calls returned HTTP 401 or 403. This does not establish cross-institution denial, guardian revocation or identity integrity.
- `fullCutoverReady` remains **false**. Full M9 cutover needs deployed, successful end-to-end Cognito invitation, both website sources, guardian verification/revocation, student/learning writes, required IAM including GSIs and rollback testing. Only approved evidence from those workflows can close the remaining gates.

## Stop conditions

Do not set `M95_COMPAT_MODE=pilot` or turn on any write flags based on this report alone. Do not delete the original five tables or legacy data. Leave audit history in the legacy table as previously agreed.
