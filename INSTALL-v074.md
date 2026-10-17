Sadhana v0.7.4 implementation — review and test BEFORE deploying.

Files modified: src/App.tsx, src/api/sadhanaClient.ts, backend/src/lambda.ts, backend/src/scheduleStore.ts.
Files added: backend/src/calendarImpact.ts, backend/src/eventManagement.ts, backend/test/calendarImpact.test.ts.

From ~/Dev/sadhana:
  mkdir -p ../sadhana-v074-backup
  cp src/App.tsx ../sadhana-v074-backup/App.tsx
  cp src/api/sadhanaClient.ts ../sadhana-v074-backup/sadhanaClient.ts
  cp backend/src/lambda.ts ../sadhana-v074-backup/lambda.ts
  cp backend/src/scheduleStore.ts ../sadhana-v074-backup/scheduleStore.ts
  unzip -o ~/Downloads/sadhana-v074-implementation.zip -d .
  npm run build
  cd backend
  npm run check
  npx tsx --test test/calendarImpact.test.ts
  npx tsx --test tests/scheduleBoundedRules.test.ts

IMPORTANT:
- No DynamoDB changes are made on installation.
- Do not deploy if typecheck/tests fail.
- Confirm AWS API Gateway forwards GET/POST/PATCH/DELETE /events and POST /schedule/series/{id}/preview to the Lambda and allows DELETE in CORS.
- Teacher event editing requires verified Cognito sub linked to active teacher profile via cognitoSub field. Unlinked logins are denied with 403.
- Delete is implemented as audited-in-record soft-cancellation, not physical removal.
- Existing session overrides are NEVER automatically removed by the preview.
- This package has been syntax-parsed, not end-to-end tested against your full local repo.
