Sadhana v0.7.5 — recurring classes

Safeguards: preview reads only; creation requires academy admin, validates registered teacher, is capped at 80 sessions, and stores master plus sessions in one DynamoDB transaction. Existing items are not modified.

Back up existing files before install:
cd ~/Dev/sadhana
mkdir -p ../sadhana-v075-backup/src/api ../sadhana-v075-backup/backend/src
cp src/App.tsx ../sadhana-v075-backup/src/
cp src/api/sadhanaClient.ts ../sadhana-v075-backup/src/api/
cp backend/src/lambda.ts ../sadhana-v075-backup/backend/src/
unzip -o ~/Downloads/sadhana-v075-recurring-classes.zip -d .
npm run build
cd backend
npm run check
npx tsx --test test/recurringClasses.test.ts
npm run build

Before AWS deployment verify Lambda role has dynamodb:TransactWriteItems for table sadhana-dev-main. This ZIP does not deploy or mutate data. Deploy only after successful full build/tests and IAM permission check.

The frontend uses the latest combined shared-event venue version (not any unshared legacy Events pane). If there are additional local App.tsx edits since this package's baseline, compare before replacing.
