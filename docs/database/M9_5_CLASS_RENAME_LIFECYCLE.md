# M9.5 — Master-class rename and calendar lifecycle (local pilot)

The patch replaces only `backend/src/m95CalendarWrite.ts` and its focused test. It builds on the previous M9.5 calendar write pilot; install that earlier patch first. The Lambda route and its feature flags remain unchanged.

## Behaviour

- A master-class rename uses `PATCH /schedule/{classId}?institution=raaga|sruti` with `{"expectedVersion":N,"name":"<admin-supplied name>"}`. No hard-coded class names are introduced.
- The update is **one DynamoDB transaction**, comprising the master class, each eligible linked class-session, and one audit record. Its capacity is limited to 98 linked sessions. Exceeding the limit fails without a write.
- Sessions with explicit `sessionOverrideFields: ["name"]`, or an independently different name, retain their customised name. Effective-dated *name* rules block renaming pending review.
- Conditional writes check the version and academy of the master and each linked session. Concurrent updates fail with 409.
- Individual session cancellation/restoration already uses the same `PATCH /schedule/{sessionId}` contract with status `cancelled` or `confirmed`, an expected version, and an audit record; the new tests cover it. This is not destructive deletion.
- Existing IDs, dates, teachers, venues, session overrides, recurring changes and historical audit records remain unchanged except for the explicitly authorised name or status edits.
- Physical table names retain the temporary `sadhana-dev-m9-*` prefix.

## Constraints still blocking full cutover

1. Rename of classes with more than 98 qualifying sessions needs a lock-backed paged workflow; this patch intentionally refuses it instead of partially updating.
2. Adding a new session concurrently with a rename is not synchronised by the old create route; keep the pilot disabled for shared live editing until that is addressed.
3. Hard deletion, bulk cancellations, managing special events, and archivability still require separate workflows.
4. Full API cutover requires guardian, registration, student, learning, IAM and rollback integration.

## Local tests

```bash
cd ~/Dev/sadhana/backend
node --import tsx --test test/m95CalendarWrite.test.ts
npm run check
npm run build
```

**Do not enable** `M95_COMPAT_MODE=pilot` or `M95_CALENDAR_WRITES=enabled` on the deployed Lambda yet. No AWS operations are performed by installing or testing this package.
