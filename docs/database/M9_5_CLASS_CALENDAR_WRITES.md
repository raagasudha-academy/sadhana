# M9.5 class/calendar write pilot — limited, reversible

## Scope
- Existing `POST /schedule?institution=raaga|sruti`: create master class or individual session.
- Existing `PATCH /schedule/{id}?institution=raaga|sruti`: edit master metadata or individual session, retaining old response shape.
- Writes are conditional and include an audit item in the same DynamoDB transaction.
- The existing API and five-table routing remain the default. No AWS deployment is included.

## Disabled by default
Both `M95_COMPAT_MODE=pilot` and `M95_CALENDAR_WRITES=enabled` are required. **Do not enable in the deployed Lambda yet.** The Lambda role needs explicit IAM permissions to the new classes, sessions and audit tables, and M9 calendar writes require live end-to-end rehearsal first.

The pilot guard blocks all other mutations globally, including registration, guardian approval, learning, event edits, series edits, teacher-link edits, deletes and recurring-class creation. Disabling pilot mode immediately restores the legacy route flow. Do not use these flags on a general-purpose production API.

## Remaining requirements before full write cutover
- Atomic master renames with linked sessions and class lifecycle transitions.
- Series rule creation/preview and recurring class/additional-session workflows.
- Managed events, holiday management, teacher/venue identity verification against M9.
- Delete/session archive semantics, audit retention, IAM and rollback rehearsal.
- Student, guardian, registration and learning integration.

Tests are mock-based. No live API or AWS write verification has occurred.

## Local checks
```bash
cd ~/Dev/sadhana
python3 apply_m95_calendar_writes.py
cd backend
npm run typecheck
node --import tsx --test test/m95CalendarWrite.test.ts
npm run check
npm run build
```

Keep both feature flags unset. Commit the implementation but not the installer.
