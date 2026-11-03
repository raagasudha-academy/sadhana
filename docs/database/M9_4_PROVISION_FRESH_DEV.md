# M9.4 — Provision the fresh 18-table development database

**Namespace:** `sadhana-dev-m9-*` rather than `sadhana-dev-*`. This is required because the existing operational table `sadhana-dev-audit` already occupies one of the original proposed target names. The new namespace leaves every existing table untouched. The patch also updates the opt-in M9 repository reader and writer to use the new namespace; it does NOT modify `tableRouter.ts`, the existing five-table API, IAM, or Lambda configuration.

Provisioning creates only **empty tables**. The separate seed step creates only the two institution records, `raaga` and `sruti`. No operational records are copied. Current Lambda still points at the old tables.

## A. Local checks and template generation

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m9-4-provision-dev.zip -d .
python3 apply_m9_table_namespace.py
cd backend
node --test test/m9Provision.test.mjs test/m9FreshStart.test.mjs
npm run typecheck
node scripts/m9ProvisionTemplate.mjs ./m9-provision-dev.json
node scripts/m9SeedInstitutions.mjs --dry-run
```

## B. Confirm correct AWS account and absent target names

```bash
aws sts get-caller-identity --profile default --region us-east-1
aws dynamodb list-tables --profile default --region us-east-1 --query 'TableNames[?starts_with(@, `sadhana-dev-m9-`)]' --output table
aws cloudformation validate-template --template-body file://m9-provision-dev.json --profile default --region us-east-1
```

Target list must be empty before first stack create. Verify the identity matches your intended development AWS account. If target tables already exist, **stop**; do not attempt to adopt or overwrite them without inspection.

## C. Explicitly provision the 18 tables (AWS write)

The user has authorised provisioning the new dev database. This next command creates paid AWS resources. Review the template first and run it only with the intended AWS profile.

```bash
aws cloudformation deploy \
  --profile default --region us-east-1 \
  --stack-name sadhana-dev-m9-fresh-tables \
  --template-file m9-provision-dev.json \
  --no-fail-on-empty-changeset

aws cloudformation describe-stacks \
  --profile default --region us-east-1 \
  --stack-name sadhana-dev-m9-fresh-tables \
  --query 'Stacks[0].StackStatus' --output text
```

Expect `CREATE_COMPLETE`. CloudFormation deploy can require permissions to manage DynamoDB, GSIs, PITR, deletion protection, and tags. Avoid running if the AWS account or Region is not correct.

## D. Seed only institutions (AWS write)

```bash
AWS_PROFILE=default AWS_REGION=us-east-1 node scripts/m9SeedInstitutions.mjs --execute
```

The seed uses conditional creates; re-running reports `already-exists` without overwriting existing institution configuration.

## E. Confirm database still fresh

```bash
aws dynamodb list-tables --profile default --region us-east-1 --query 'TableNames[?starts_with(@, `sadhana-dev-m9-`)]' --output table
aws dynamodb scan --profile default --region us-east-1 --table-name sadhana-dev-m9-institutions --select COUNT --query Count --output text
```

Expected: 18 target tables; exactly 2 institution records. The other 17 tables should remain empty.

## F. Safety and next steps

* No migration: **642 legacy records stay in existing tables; zero are copied**.
* Do not enable `M9_API_ENABLED`, `M9_TARGET_REPOSITORY_ENABLED`, or `M9_TARGET_REPOSITORY_WRITES` yet.
* The active Lambda IAM role is not automatically granted permission to the new tables. Adjust IAM and redeploy only during the separate cutover milestone.
* Recreate operational teachers, Cognito mappings, roles, venues, classes, schedules and events as NEW records through validated admin workflows before switching traffic. The original records must remain accessible in the old backend until then.
* CloudFormation deletion protection + Retain protects against accidental table deletion; resources have ongoing AWS cost.
* Test the M9 API against a controlled local/dev endpoint only after role permissions and table mapping are ready.

To commit locally, stage `backend/scripts/m9ProvisionTemplate.mjs`, `backend/scripts/m9SeedInstitutions.mjs`, `backend/test/m9Provision.test.mjs`, updated `backend/src/m9TargetRepository.ts`, `backend/src/m9TargetWriter.ts` and this document. Do not commit `backend/m9-provision-dev.json` if you prefer generated artifacts stay local.
