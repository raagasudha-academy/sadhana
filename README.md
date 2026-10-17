# Sadhana v0.7.2 — Venue Management

**New in v0.7.2:** Authenticated Add and Edit on the central venue directory, saved to DynamoDB with optimistic locking and audit logging. The imported 294 timetable items are not rewritten by venue edits. See [VENUE_MANAGEMENT_V072.md](VENUE_MANAGEMENT_V072.md) for deployment and verification.

---

# Sadhana v0.7.1 — Live Venues

This build adds three central, AWS-backed venue records and links them to the already-imported v0.7 timetable. See **VENUE_LINKING_README.md** for the one-time link steps. The original v0.7 README follows.

---

# Sadhana v0.7 — Live Academy Calendar (one-time migration)

This is a complete React + TypeScript portal project **with an updated Cognito-protected AWS Lambda API** and a **one-time, administrator-operated DynamoDB import tool**. It does **not** make any Google Calendar API calls during migration, and the previous Google sync endpoint is disabled (HTTP 410). It is not a pre-deployed release: applying the ZIP locally does not itself update AWS or import events.

## What is included

- Sadhana-owned Month / Week / List views with individual session details and edits persisted through the protected API.
- Editable master class details and individual session details (time, date, teacher, venue, programme, status). A master change does **not** rewrite historical sessions.
- Complete import manifest: **7 master classes + 287 dated entries = 294 DynamoDB items**. One item per master class/session/event/holiday, **not** a single JSON dump.
- **216 Raagasudha Singing sessions:** Middlesbrough 36 x 17:00–18:00 Sunday; Durham 36 x 08:30–11:00 Sunday; Newcastle 36 Saturdays x 4 half-hour singing slots, 13:00–15:00.
- **36 Śruti Vedam Newcastle Vedanta sessions:** Saturdays 15:00–15:30; teacher not yet confirmed.
- **32 informational Newcastle school-holiday records**, not automatically cancelling classes, and **3 Raagasudha events/rehearsals**.
- Teacher for Raagasudha singing is **Mrs Praveena Srikailash**, all these teaching sessions **In-person**.
- Source Google links, calendar IDs and Google event IDs are **not included** in DynamoDB records or the import manifest. The manifest uses deterministic Sadhana IDs and import keys to avoid duplicate inserts.
- JunctionFarm Holidays (25) and Online Sessions (169) are excluded.

**What's not done:** This ZIP has **not been deployed** to your AWS account, and **no DynamoDB import has run**. The existing family/student/practice/venue screens are still browser-only and must not be used for persistent real student data. Charu and the original Google Calendars are untouched.

## Installation — local portal first

Back up your existing `sadhana` project. Extract this ZIP to a fresh folder, and copy over **only your existing `.env.local`**. Do not overwrite your original project without a backup; never publish or commit `.env.local`.

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Open `http://localhost:5173/` and log in normally. Until the new Lambda is deployed, the timetable will show that the v0.7 endpoint is unavailable. This is expected.

## Before importing to AWS

1. Confirm Cognito MFA (prefer TOTP) and appropriate administrator permissions before moving data that could contain personal information into AWS. Review UK data-transfer requirements for the existing `us-east-1` region.
2. Ensure **DynamoDB point-in-time recovery (PITR) is enabled** on `sadhana-dev-main` and that you have reviewed the cost. The importer deliberately refuses writes if it is disabled.
3. Deploy the updated Lambda to the existing `sadhana-dev` stack using a reviewed CloudFormation change set. **Do not create a new DynamoDB table or overwrite your currently deployed stage with unreviewed parameters.** From the project root, after `npm install --prefix backend`:

```bash
npm --prefix backend test
npm --prefix backend run typecheck
sam validate --lint --template-file infra/template.yaml --region us-east-1
PATH="$PWD/backend/node_modules/.bin:$PATH" sam build --template-file infra/template.yaml --no-cached
```

For an existing stack, use the **same CloudFormation parameters as your last successful deployment**; set `EnablePointInTimeRecovery=true` when reviewing this change. For example, to prepare a change set **without applying it**:

```bash
PATH="$PWD/backend/node_modules/.bin:$PATH" sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name sadhana-dev --region us-east-1 --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    Stage=dev \
    CognitoUserPoolId=us-east-1_nyQjIQasG \
    CognitoAppClientId=5l61r0hmdb2ga2dregunoeqsqe \
    AllowedPortalOrigin=http://localhost:5173 \
    MiddlesbroughCredentialParameter=/sadhana/dev/google/middlesbrough-service-account \
    EnablePointInTimeRecovery=true \
  --no-execute-changeset
```

Check CloudFormation **Change sets**. Confirm the existing DynamoDB table is **not replaced/deleted** and only intended changes (Lambda code/backup flag, if not already enabled) are applied. Execute the change set only once you approve it.

## One-time database import — dry run, then explicit approval

From the project root, use the same configured AWS CLI profile/role as your Sadhana DEV infrastructure; make sure it points to **us-east-1**. Never paste AWS credentials or login tokens in chat.

```bash
npm install --prefix backend
export AWS_REGION=us-east-1
aws sts get-caller-identity
npm --prefix backend run import:calendar -- --table sadhana-dev-main
```

The default mode performs read-only DynamoDB checks and reports new vs already-existing records. It **never writes** without BOTH explicit flags. After reviewing the dry run and verifying PITR is enabled:

```bash
npm --prefix backend run import:calendar -- \
  --table sadhana-dev-main --apply --confirm IMPORT-294
```

Expected initial creation: **294 records** (7 master classes + 287 dated records), minus any existing matching IDs. Imported IDs are deterministic and writes use `attribute_not_exists`, so rerunning safely skips existing records. **Existing records are never overwritten**. Partial failures can be safely retried. The importer does not delete or modify existing pilot Google-mirror records; the v0.7 timetable reads the new Sadhana-native partition only.

Verify in Sadhana → **Raagasudha → Classes & Timetable → Month**; then switch to Śruti Vedam to see Newcastle Vedanta entries. Select a date to edit one session or a master class. Changes only affect Sadhana.

## Scope & known limitations

- The event snapshot represents the calendar data found for the period from 2000-01-01 through 2040-12-31, not an open-ended future recurrence engine. Add later sessions directly in Sadhana.
- Holidays are informational shared events (`affectsClasses=false`) and do not cancel attendance or lessons.
- Changes to an individual session work, but moving sessions between masters/institutions and bulk splitting a timetable need further UI workflows. You can create separately linked sessions through the protected API.
- The home-dashboard class stats and student/practice screens are **not yet backed by the schedule master classes**; the live schedule is visible in **Classes & Timetable**.
- As an initial import, detailed audit entries for every migrated record are not yet created; record keys, creation timestamps, deterministic import keys and conditional writes support reconciliation. Add stronger actor-based import audit before larger production migrations.

## Verification status

Backend's 17 existing `node --test` cases and 294-record schema validation passed in this package's preparation. Complete dependency-based npm/TypeScript/SAM checks require execution in your local environment before deployment.
