# M8 — Sadhana database baseline and go-live plan

## Source reviewed
M7 backend source archive (2026-11-03); this report describes source code, **not a verified live AWS inventory**. No AWS calls or writes were made while preparing this package.

## Physical tables identified by `backend/src/tableRouter.ts`

| Runtime mode | Table | Intended storage / route ownership |
|---|---|---|
| `SADHANA_DATA_MODE=split` | `sadhana-dev-calendar` | Class schedules, calendar series, class/venue records |
| split | `sadhana-dev-students` | Students, families, enrolments, website import markers, counters |
| split | `sadhana-dev-learning` | Homework, practice, attendance, feedback, RSVP |
| split | `sadhana-dev-admin` | Teacher registry, Cognito subject linkage, guardian access |
| split | `sadhana-dev-audit` | Audit records |
| otherwise | `SADHANA_TABLE_NAME` | Legacy table (name provided by deployed environment) |

The source also uses a **separate Raagasudha website registration service**, including its own registration table and photo bucket. This M8 utility inventories **Sadhana tables only**; website assets and Cognito accounts require separate authorised inventory before any cleanup.

## Key patterns presently in use

| Pattern | Function | Go-live treatment |
|---|---|---|
| `OPS#GLOBAL#FAMILY` / `ITEM#<id>` | Family | Review test records and dependants |
| `OPS#GLOBAL#STUDENT` / `ITEM#<id>` | Student | Review test records and dependants |
| `OPS#<institution>#ENROLMENT` | Class membership | Review only when linked to verified test student |
| `OPS#GLOBAL#WEB_IMPORT` | Website import marker and identity fences | Preserve until website/Cognito state reconciled |
| `OPS#raaga#COUNTERS`, `OPS#GLOBAL#COUNTERS` | Roll/family number allocation | **Preserve** — never reset or reuse issued numbers |
| `SCHEDULE#...`, `SCHEDULE_SERIES#...` | Master classes, dated sessions, series, events | **Preserve** |
| `TEACHER_REGISTRY`, `TEACHER_SUB#...` | Staff identities and links | **Preserve** |
| `OPS#<institution>#HOMEWORK...` | Homework, completions, submissions | Review if test student-linked |
| `OPS#<institution>#PRACTICE/ATTENDANCE/RSVP/FEEDBACK` | Learning and operations | Review; preserve unrelated operational records |
| `AUDIT#...` | Audit/security history | **Preserve** |
| `STUDENT#<id>` / `META`, `FAMILY#<id>` / `META`, `PRACTICE#...` | Legacy resource-model records | Do not conflate with OPS keys; review migration needs |

Code currently supports multiple key conventions. **Do not change PK/SK in place or create a new physical schema without live inventory, access-pattern validation and a migration/rollback plan.** Logical domains are not equivalent to separate physical tables.

## Read-only inventory commands

From the local repo, using an AWS profile authorised for `dynamodb:DescribeTable` (and `dynamodb:Scan` only if using `--scan`):

```bash
cd ~/Dev/sadhana/backend
AWS_PROFILE=<your-readonly-profile> AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
  node scripts/databaseInventory.mjs
```

To inspect **key-only categories** (reads up to 10,000 items per table; potentially consumes read capacity):

```bash
AWS_PROFILE=<your-readonly-profile> AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
  node scripts/databaseInventory.mjs --scan --max-items 10000
```

If production is running legacy mode, omit `SADHANA_DATA_MODE` and set its **actual** `SADHANA_TABLE_NAME`. Confirm environment names before executing. The tool contains only DescribeTable and Scan commands; no update/delete/put capabilities, and outputs no names, emails, phone numbers, or raw IDs. The `ItemCount` returned by DynamoDB DescribeTable is approximate and can lag by hours. Limited scans are partial and never prove cleanup safety.

## Retention and cleanup policy

**Retain:** administrator and teacher identities, class masters and calendar occurrences, events, venues, counters and audit; any real operational records.

**Candidates for separate, manual review:** test-only students and families, website registrations, learning submissions, homework, practice, attendance, RSVP, access links, enrolments and media associated with *identified test identities*. A record being in a review category **does not mean it is safe to delete**.

**Required before any deletion:**
1. Verified backups/PITR and an explicit restore drill or export.
2. Authorised owner supplies a manifest of test registration IDs, family IDs and student IDs; verify there are no real learners, shared guardians, cross-institution links or real classes with associated records.
3. Reconcile both Raagasudha website import status and Sadhana markers, Cognito user accounts, guardian access queues, photos, homework media and other S3 objects.
4. Enumerate inbound references from *every* table and service; consider audit retention and legal/privacy rules.
5. Produce an exact item-by-item dry-run with PK/SK, table, expected version, reason, dependencies and rollback evidence in secure local storage. Do not share this PII manifest in chat.
6. Explicit second approval for a separate cleanup implementation. No automatic execution flags or broad wildcard deletes.

## Next decision gates

- Confirm live runtime mode, AWS account/region, five table definitions and actual GSI schemas.
- Review output of read-only describe and optional key-only scan.
- Approve a stable physical schema mapping or accept existing keys through go-live (safer default).
- Build a **separate** test-data dependency manifest, then independent deletion approval.
- Add Curriculum & Progress as **Coming Soon** in application UI only; no new learning tables required yet.
