# Cascade deletion frontend contract

Student and family detail views show the shared CascadeDeleteControl only when the authenticated `/me` response supplies `isSuperAdmin: true`. The API computes that flag from verified Cognito group membership. The flag controls presentation only; deletion endpoints must enforce the group themselves.

The Super Admin preview and execute endpoints are implemented in the canonical final-table route. Existing archive/delete endpoints are not used as fallbacks.

Both requests include `?institution=raaga|sruti`.

- POST `/super-admin/deletions/preview`: `{type, id, expectedVersion}`.
- Preview response: `{targetType, targetId, expectedVersion, signature, counts: [{label, count}], total}`. Counts include the target record and sum to total. The signature must bind the actor, scope, target version and complete affected set, and expire server-side.
- POST `/super-admin/deletions/execute`: `{type, id, expectedVersion, signature, confirm: "DELETE"}`.
- Execution response: `{deleted: true}` only after deletion completes.

The backend enforces the Super Admin claim, resolves canonical dependencies, rejects expired or changed previews, and audits successful deletion. Execution stays fail-closed unless both `SADHANA_FINAL_CASCADE_EXECUTE=enabled` and `SADHANA_FINAL_CASCADE_WRITER_FENCE_VERIFIED=enabled` are present. The second flag may only be set after all canonical writers are verified to reject writes against a deleting identity; the scan-and-delete preview alone does not close that race.

An imported individual student may be deleted only when exactly one canonical Sadhana import marker matches the student, source registration, family and active student mapping. The deletion transaction removes that student from the marker's active mapping, records the removed mapping for audit, and retains the source website registration. Imported family deletion and ambiguous/missing provenance remain blocked.

Student roll numbers are one-time identifiers. The per-academy high-water counters are never decremented, and `ROLL_UNIQUE` reservation records are retained even when an eligible student or family is deleted. A removed roll number must never be assigned to a different learner. Student person IDs are generated as UUIDs and are not sequence-counter values.

UI confirmation does not replace these checks. Larger operations require a durable job protocol before they can be presented as complete.

The reusable control takes a target type and can be connected to additional record detail screens once their dependency policy and backend routes are ready.
