# M9.5 — effective-dated recurring class changes (local opt-in)

Extends the existing compatibility pilot with the established request contract:
- `POST /schedule/series/{classId}/preview?institution=raaga`
- `PATCH /schedule/series/{classId}?institution=raaga`

Requires `M95_COMPAT_MODE=pilot`, `M95_CALENDAR_WRITES=enabled`, and `M95_SERIES_WRITES=enabled`.
The flags must remain **unset in deployed Lambda** until full cutover, IAM and rollback tests are completed.

This patch applies new series rules without rewriting existing dated sessions, preserving historical overrides and effective dates. It performs a strong-consistent class read and scans series/session items in M9, validates the current master's version and dates, protects against duplicate effective dates, and transacts a master version increment, a rule insert, and an audit record. The master `legacyPayload.version` is updated in the same transaction so legacy-compatible schedule reads remain consistent. Future occurrences inherit the rule through the existing schedule projection function.

Teacher identity changes require an active teacher record in M9 People whose displayed name or alias matches the selected name and whose institution membership is correct.

Not covered: master-class renames, bulk deletion, master deletion, managed-event writes, calendar synchronisation and wider application cutover. Existing backend remains default with feature flags unset. Do not deploy or enable pilot until all critical workflow tests pass.

Install from repository root: `python3 apply_m95_series.py`.
Tests: `cd backend && npm run typecheck && node --import tsx --test test/m95SeriesWrite.test.ts && npm run check && npm run build`.
