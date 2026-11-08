# M9.5 Full API Routing — cutover gate (local, read-only)

This is a **cutover assessment**, not a full routing implementation or a live switchover. The current API still depends on the five-table layout in teacherDirectory, academyOperations, registrations, guardian access, learning, scheduling mutations and other modules. Forcing a router swap would lose data visibility and split write streams.

## Run

```sh
cd ~/Dev/sadhana/backend
node --test test/finalCutoverGate.test.mjs
AWS_PROFILE=default AWS_REGION=us-east-1 SADHANA_DATA_MODE=split \
  node --import tsx scripts/apiCutoverPreflight.mjs --report ./api-cutover-preflight.json
```

The program reads five existing source tables and five new M9 operational tables through the existing transfer dry-run logic. It rejects any data drift and compares **the actual legacy and M9 schedule API records** for `raaga`, `sruti`, `shared` and **managed events** for the two institutions. It produces a report and cannot perform writes/deployments.

An exit code of 2 means operational read parity is not demonstrated. If parity passes, `operationalReadPilotEligible` may be true, but `fullCutoverReady` remains false until all workflow adapters, permissions, IAM and rollback have been demonstrated. Do **not** turn on `M95_COMPAT_MODE=pilot` on the deployed Lambda solely because this preflight passes; pilot blocks all mutations.

## Remaining actual code work before a full cutover

1. Replace staff teacher-directory lookup and identity linking with M9 People table lookups and permission-checked writes.
2. Replace shared venue directory, class CRUD and master/recurrence editing with M9 repositories and cross-entity transactions.
3. Implement student, family, enrolment, guardian approval, website registration/import and Cognito flows on the new schema.
4. Implement attendance, practice, homework, submissions, events/RSVP and audit workflows on new tables, including validation and indexing.
5. Update Lambda IAM to allow exactly the necessary M9 tables and indexes; perform authenticated end-to-end API testing for both institutions.
6. Design an explicit write-freeze/consistency window, rollback to previous API flags and data reconciliation before switching real writes.

## Existing state

The new operational records total 461 (22 classes, 423 sessions/holidays/series rules, six events, three venues and seven teachers). The old audit history remains on the original table by design; no old audit data is automatically readable through the new M9 audit table.

No AWS changes, deployment or router edits are part of this package.
