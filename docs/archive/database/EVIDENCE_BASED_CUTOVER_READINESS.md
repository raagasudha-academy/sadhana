# M9 — Evidence-based cutover readiness (local-only)

This replaces the two static parity flags in `finalCutoverReadiness.mjs` with a fresh **measured** comparison of source and target API projections. It does not turn any M9 write flag on, deploy Lambda, or migrate records.

## Install

Unzip this package into the root of the existing Sadhana repository. Source changes: `backend/scripts/finalCutoverReadiness.mjs`, new `backend/scripts/verifyReadParity.mjs`, new `backend/src/readinessEvidenceCore.mjs`, new `backend/test/readinessEvidence.test.mjs`.

## Run

```bash
cd ~/Dev/sadhana/backend
node --test test/readinessEvidence.test.mjs
npm run check
npm run build

AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split SADHANA_TABLE_NAME=sadhana-dev-main \
  node --import tsx scripts/verifyReadParity.mjs --report ./live-parity.json

AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split SADHANA_TABLE_NAME=sadhana-dev-main \
  node scripts/finalCutoverReadiness.mjs --parity-report ./live-parity.json --report ./final-readiness-v2.json

cat final-readiness-v2.json
```

The parity report must be under 15 minutes old when the readiness report is generated. A missing, stale, malformed or mismatching report fails closed. Report files are `wx` (refuse overwriting), so choose new filenames for each run. The verifier exits with status 2 if parity differs; inspect its report rather than asserting success.

## What is actually checked

* Each of Raagasudha, Sruti and shared `/schedule` response projections, including the 6 special events and effective-date series rules.
* Each academy's administrator-managed `/events` response.
* Each academy's `/teachers`, `/teachers/me` and `/venues` result shapes, from both legacy and M9 readers.
* Counts and SHA-256 hashes over canonicalized response data; volatile signed photo URLs are omitted from comparison.
* All 18 table statuses and count baseline (original readiness script) plus two institution seed records.

These are **direct DB-backed endpoint projection comparisons**, not actual signed HTTP requests to the deployed API; synthetic admin claims are only used to exercise service-level readers. They do NOT prove the deployed Lambda's identity and authorization gate, public website connectivity, Cognito invitation delivery, learning writes, S3 upload permissions, IAM policy, or rollback procedure.

## What is deliberately not auto-approved

The following still require independently executed deployed end-to-end test evidence:

1. Cognito parent invitations and verified identity provisioning on M9.
2. Guardian approval, revocation and real portal login against M9.
3. Approved registration, import acknowledgement and website sync for **both** Raagasudha and Sruti.
4. Student, attendance, practice, homework and upload workflows on M9.
5. Calendar write permissions under the deployed Lambda role.
6. Full M9 IAM access, including Cognito/S3 restrictions.
7. Successful switch to M9 and rollback to the existing five-table API without losing writes.
8. Deployed negative-authorization tests (cross-academy, forged identity, revoked guardian, viewer mutation).

These eight still report `UNVERIFIED_...` until real verification is implemented; DO NOT manually edit JSON or change those fields to `true`. This phase improves evidence quality, not the scope of the deployed API. Full cutover remains blocked.

## Safety notes

* Existing five Sadhana tables and the legacy table remain unchanged.
* No GitHub push, CloudFormation update, or Lambda deployment is part of this patch.
* The commands read DynamoDB; they may cause read request charges.
* Reports contain checksums, counts and environment metadata. Keep them local.
* The actual live Lambda continues using the existing routing; `M95_COMPAT_MODE` should stay `off` or `shadow`.
