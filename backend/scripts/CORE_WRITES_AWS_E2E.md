M10 Core Writes Real AWS Test

IMPORTANT: The isolated Lambda does not yet have the new Core Writes code. This runner executes the current LOCAL Core Write service against the same M9 development DynamoDB tables. It is NOT an end-to-end test of the deployed Lambda/API/Cognito authorizer. Production Lambda is not changed.

The M9 dev tables are SHARED between isolated M9 API and migration/website dev records. '--apply' writes synthetic records, advances counters and leaves records for inspection. No Cognito accounts or approval grants are created. Do not use --apply without reviewing this note.

Run from ~/Dev/sadhana:
unzip -o ~/Downloads/sadhana-m10-core-aws-e2e.zip -d .
cd backend
npx --no-install tsx scripts/coreWritesAwsE2E.ts

Only after preflight passes and you accept synthetic M9 development records:
M10_E2E_CONFIRM=WRITE_SYNTHETIC_M9_DEV_DATA npx --no-install tsx scripts/coreWritesAwsE2E.ts --apply

The full Core Writes path also requires API-auth tests and deployment to the isolated Lambda, separate from direct DynamoDB integration checks.
