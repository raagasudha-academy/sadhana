# M9.5 API compatibility / controlled read pilot

## What this implements

- New adapter `m95Compatibility.ts` scans the five transferred M9 operational tables only, reconstructs legacy schedule and managed-event response bodies from `legacyPayload`, and re-applies effective-dated timetable series changes.
- `M95_COMPAT_MODE=shadow`: original `/schedule` and administrator `/events` GET responses stay authoritative. M9 data is compared, with counts and equality logged. An M9 read failure is logged but never alters the legacy response.
- `M95_COMPAT_MODE=pilot`: selected GETs (`/schedule`, administrator `/events`) read M9. **All POST/PATCH/PUT/DELETE requests to the API are blocked with 503**, preventing writes to the old tables while these reads come from new ones. This is a read-only pilot, **not a full application cutover**. Other GET surfaces still use legacy backend tables.
- With the flag unset or `off`, there is no change to normal API behaviour. Emergency rollback: unset `M95_COMPAT_MODE` (or set `off`) and restart local API; in deployed Lambda, apply the equivalent environment change. No data is written by this adapter.
- No automatic deployment, Lambda environment changes, source-table edits, schema changes or production IAM changes.

## Limitations before full cutover

1. This dev-only compatibility reader uses strongly consistent, paginated scans of five small operational tables. Replace with complete indexed access patterns before production; the current `InstitutionSessionsIndex` excludes all-day holidays and effective-dated rules without `startAt`.
2. Teacher directory, venues, enrolments, learning, registrations, access workflows, and all corresponding writes are **not cut over**.
3. Administrator managed-events pilot is supported; teachers' managed-event GET retains legacy authorisation/filtering until the teacher ownership adapter is complete.
4. Legacy raw data is restricted to the backend; API outputs never include `migrationSource`, `legacyPayload` or transformed key metadata.
5. A Lambda role will need `dynamodb:Scan` on the five new M9 tables if a deployment is later authorised. Do not broaden access indiscriminately.
6. The approved 461-record AWS transfer is assumed; the module is tested locally against fakes, not verified against your deployed Lambda.

## Install (local)

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m9-5-api-compatibility.zip -d .
python3 apply_m95_compat.py
cd backend
npm run typecheck
node --import tsx --test test/m95Compatibility.test.ts
npm run check
npm run build
```

## Behaviour modes

| Mode | `/schedule` GET | `/events` GET (admin) | Mutating API requests |
|---|---|---|---|
| unset / `off` | Old DB | Old DB | Existing behaviour |
| `shadow` | Old DB; M9 compared | Old DB; M9 compared | Existing behaviour |
| `pilot` | M9 | M9 | Blocked with 503 |

**Use `shadow` first.** Compare response counts and field-level parity for `raaga`, `sruti` and `shared`. If all results match, a local pilot can be tried; do not set the mode on a live Lambda without an explicit operations window.

## Known mapping risks

- M9 `events` contains 6 special events, not necessarily all marked `managedEvent:true`; only managed events appear in `/events`.
- Projection of effective-dated rules depends on the London current day, so comparisons may vary when a new rule takes effect.
- An old-record update after the 461-record copy will cause intentional shadow divergence. Freeze writes and reconcile changes before a live read cutover.
- New M9 class/event write routes are **not** substitutes for the old schedule/event mutation flows; their new entities cannot be edited through the original app screens without further work.
