# M9.4 — Fresh database bootstrap (replaces migration rehearsal)

Decision: **Do not migrate or copy the 642 legacy records (or 635 transformed previews).**
Create the 18 approved physical tables as fresh, empty data stores when provisioning is explicitly approved. Initially seed ONLY two institution configuration records (`raaga` and `sruti`). This package generates a local plan and tests; it cannot create tables, call AWS, or modify the existing API.

## Run
From `~/Dev/sadhana/backend`:

```bash
node --test test/m9FreshStart.test.mjs
node scripts/m9FreshStartPreview.mjs --output ./m9-fresh-start-preview.json
cat ./m9-fresh-start-preview.json
```

The preview lists 18 target tables, 2 institution seed objects, zero existing records to import, and a `NOT_READY_FOR_CUTOVER` status. The institution seed objects are intentionally minimal. Do not assume complete branding, contact settings or teacher identities from previous records.

## Critical safeguard
The user's earlier instruction to preserve teachers, administrators, classes, venues, sessions and events still matters: those records **remain preserved in the existing AWS tables** but **will not automatically appear in the new 18-table database**. Recreate or explicitly re-enter the operational setup, verify teacher Cognito associations and permissions, recurring schedules, holidays, venues and events, and compare with the old UI before switching traffic. Do not delete legacy tables or change routing automatically.

The existing Sadhana legacy and five split tables, Cognito pool, S3 buckets and website registration stores stay untouched.

## Go-live gates
- Separate AWS approval to provision 18 tables and insert two institutions.
- New operational records created using approved admin workflows; no automated copying from old records.
- Confirm teacher/admin Cognito access and correct institution roles.
- Confirm venues, 22 classes, 382 existing class sessions, 32 holidays, 9 series changes, 6 events **are handled appropriately** in the new operation model, or consciously replaced with newly entered schedule data. These are historical counts for checking, **not import targets**.
- Confirm guardian flows, registrations, counters, family links, homework and attendance work end-to-end on the new tables.
- Explicit cutover and rollback approval.
