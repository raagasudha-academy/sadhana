# M9.5 Managed Events & Calendar Lifecycle — local pilot

This patch intercepts **existing** `/events` and `/events/shared` POST/PATCH/DELETE routes only when both `M95_COMPAT_MODE=pilot` and `M95_MANAGED_EVENT_WRITES=enabled` are explicitly set. In the normal `off` or `shadow` modes existing routing is unchanged. The patch has not been deployed.

## Features

- New managed events and edits use M9 `events`; event history stays in `legacyPayload` to preserve existing `/schedule` and `/events` read adapters.
- PATCH of a cancelled managed event restores it to confirmed while applying the supplied event fields, matching the old editor's behaviour.
- DELETE cancels softly (never deletes an event), with optimistic version and institution guards.
- Active teachers can edit only events they own; academy administrators can manage their own academy. Teachers are resolved using their existing verified Cognito subject in the M9 People table.
- Shared event creation, editing and cancellation require both academy administrator roles; a transaction writes the two academy projections and one audit entry. Shared projections have physical IDs suffixed `__raaga` and `__sruti`, but the legacy `id` remains the same.
- All M9 writes produce audit records in the new M9 audit table. Existing audit history remains in the original database.
- Validation preserves the established `eventKind`, `programme`, `mode`, venue and teacher rules; rejects ambiguous/nonexistent UK DST times.
- A transferred historical event whose top-level `version` is absent is edited only under a conditional `attribute_not_exists(version)` write, using its version in `legacyPayload` for the API check.

## Limits and safeguards

- This does **not** switch the deployed Lambda or the student/registration/learning APIs.
- Shared events previously transferred with a different physical ID convention require explicit mapping before they can be edited through `/events/shared`; the adapter fails closed rather than making a partial update.
- Run all tests and a live API shadow check before enabling any flags. Ensure Lambda IAM permits writes to M9 events and audit tables; not verified by this patch.
- Keep `M95_COMPAT_MODE=off` on the deployed Lambda until broader cutover is approved.

## Local verification

```sh
cd ~/Dev/sadhana/backend
npm run typecheck
node --import tsx --test test/m95ManagedEventWrite.test.ts test/m95CalendarWrite.test.ts test/m95SeriesWrite.test.ts
npm run check
npm run build
```
