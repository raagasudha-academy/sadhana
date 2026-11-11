# Cascade deletion frontend contract

Student and family detail views show the shared CascadeDeleteControl only when the authenticated `/me` response supplies `isSuperAdmin: true`. The API computes that flag from verified Cognito group membership. The flag controls presentation only; deletion endpoints must enforce the group themselves.

The frontend is implemented. The endpoints below are not implemented yet. Until they exist, preview fails and execution stays disabled. Existing archive/delete endpoints are not used as fallbacks.

Both requests include `?institution=raaga|sruti`.

- POST `/super-admin/deletions/preview`: `{type, id, expectedVersion}`.
- Preview response: `{targetType, targetId, expectedVersion, signature, counts: [{label, count}], total}`. Counts include the target record and sum to total. The signature must bind the actor, scope, target version and complete affected set, and expire server-side.
- POST `/super-admin/deletions/execute`: `{type, id, expectedVersion, signature, confirm: "DELETE"}`.
- Execution response: `{deleted: true}` only after deletion completes.

The backend must enforce authorization, resolve canonical dependencies, reject expired or changed previews, prevent concurrent writes from leaving orphaned records, and audit the deletion. UI confirmation does not replace these checks. Larger operations require a durable job protocol before they can be presented as complete.

The reusable control takes a target type and can be connected to additional record detail screens once their dependency policy and backend routes are ready.
