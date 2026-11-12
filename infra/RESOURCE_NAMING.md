# AWS resource naming and migration

Use the environment first for stage-scoped resources: `dev-<application>-<resource>` and
`prod-<application>-<resource>`. Do not delete the current names during the migration.

## Canonical names

| Resource                           | Development                                                   | Production                                                      |
| ---------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Sadhana entity tables              | `dev-sadhana-<entity>`                                        | `prod-sadhana-<entity>`                                         |
| Sadhana audit table                | `dev-sadhana-audit-records`                                   | `prod-sadhana-audit-records`                                    |
| Imported registration records      | `dev-sadhana-registrations`                                   | `prod-sadhana-registrations`                                    |
| Sruti intake source                | `dev-sruti-student-registrations`                             | `prod-sruti-student-registrations`                              |
| Raaga Sudha intake source          | `dev-raagasudha-student-registrations`                        | `prod-raagasudha-student-registrations`                         |
| Sadhana API and Lambda             | `dev-sadhana-api`                                             | `prod-sadhana-api`                                              |
| Sadhana homework media bucket      | `dev-sadhana-homework-media-<account>-<region>`               | `prod-sadhana-homework-media-<account>-<region>`                |
| Sadhana profile photo bucket       | `dev-sadhana-profile-photos-<account>-<region>`               | `prod-sadhana-profile-photos-<account>-<region>`                |
| Sruti public intake API and Lambda | `dev-sadhana-sruti-public-intake` / `dev-sruti-public-intake` | `prod-sadhana-sruti-public-intake` / `prod-sruti-public-intake` |
| Sruti intake deployment bucket     | `dev-sadhana-intake-deploy-<account>-<region>`                | `prod-sadhana-intake-deploy-<account>-<region>`                 |
| Portal asset bucket                | n/a                                                           | `prod-sadhana-portal-<account>`                                 |
| Staff Cognito pool                 | n/a                                                           | `prod-sadhana-staff`                                            |

Use these CloudFormation stack names for newly created stacks: `dev-sadhana-app`,
`prod-sadhana-app`, `dev-sadhana-entity-tables`, `prod-sadhana-entity-tables`,
`prod-sadhana-portal`, and `prod-sadhana-cognito`. CloudFormation stack names are supplied
by deployment commands, so they are not encoded in the templates. Existing stack names
cannot be renamed in place; move retained resources to a new stack only through a reviewed
CloudFormation resource import/refactor. Keep the current Cognito user-pool ID and its users
while updating its display name, so staff identities and app-client configuration survive.

The existing M9 tables and their guarded migration tools remain on their current names until
the separate M9 cutover passes. The new canonical router uses environment-first names. This
keeps the deployed legacy route intact while replacement tables are created and verified.

## Migration order

1. Create the environment-first tables in new stacks; retain the existing stacks and tables.
2. Back up and copy development data into the `dev-sadhana-*` tables, then verify table
   schemas, item counts, and sampled records. Keep the old tables available for rollback.
3. Copy only the previously selected classes, calendar sessions, venues, shared events, and
   minimal teacher profiles from development into production. Do not copy registrations or
   family/login data as part of this seed.
4. Deploy the Sadhana app with stage-specific table, bucket, Cognito, API, and CORS settings.
5. Copy the existing Raaga Sudha intake records to `prod-raagasudha-student-registrations`.
   Point its production intake Lambda to that source table.
6. Deploy the disabled Sruti intake stack, verify it writes only to
   `prod-sruti-student-registrations`, then switch the Sruti site's API URL and enable it.
   Sruti imports remain an explicit admin action into the selected stage's
   `*-sadhana-registrations` table.
7. Verify both production domains, API CORS, login, registration review/import, and media
   access. Retire old resources only through a separately reviewed cleanup step.

The table template generator can prepare a local template without making AWS calls:

```sh
node backend/scripts/prodEntityTablesTemplate.mjs --stage dev --output /tmp/dev-sadhana-tables.json
node backend/scripts/prodEntityTablesTemplate.mjs --stage prod --output /tmp/prod-sadhana-tables.json
```

Changing a DynamoDB `TableName` in CloudFormation requires replacement; the replacement
tables must be created and populated before application routing switches. See the
[AWS CloudFormation DynamoDB table reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html).
