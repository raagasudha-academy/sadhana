# M9.5 — Teacher & Venue Directory API Compatibility (local patch)

This patch intercepts only existing `GET /teachers`, `GET /teachers/me` and `GET /venues` when `M95_COMPAT_MODE` is `shadow` or `pilot`. It does not change teacher/venue CRUD, learner academy-directory, Cognito groups, registrations, or the old DynamoDB table router.

## Modes
- Unset / `off`: all three existing endpoints run unchanged.
- `shadow`: existing API responses are returned; M9 teacher/venue data is compared and only counts/equality are logged. Photo URL expiration is excluded from comparison. M9 errors are logged without changing the old response.
- `pilot`: those three GET endpoints return M9 records (with original API structure and role checks). **The existing global M9.5 pilot guard still blocks API mutations.** Do not enable this in the deployed Lambda until all other workflows and IAM permissions are complete.

The module reads `sadhana-dev-m9-people` and `sadhana-dev-m9-venues`. It accepts only original transferred records carrying `legacyPayload`; no source-table writes occur.

`GET /teachers`: preserves legacy `records` / `more` response and institution filtering. Cognito subject is hidden for non-admin viewers; photo URLs are signed through the existing photo function.

`GET /teachers/me`: matches active institution-scoped teacher by the verified `claims.sub` and returns `linked` and `teacherId`. Names never grant access.

`GET /venues`: returns the shared venue directory and strips DynamoDB index fields. Protected with the same institution-view permission as the old endpoint.

Student `/learner/{id}/academy-directory`, which has a different access model, deliberately remains on legacy until the learner workflow is ported.

## Local apply

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m95-directory-integration.zip -d .
python3 apply_m95_directories.py
cd backend
npm run typecheck
node --import tsx --test test/m95DirectoryCompatibility.test.ts test/m95Compatibility.test.ts
npm run check
npm run build
```

Run shadow parity using the same locally configured API execution flow already used for timetable shadow checks. Verify both institutions for `/teachers`, `/teachers/me` (with a linked staff login), and `/venues` before considering pilot. Keep `M95_COMPAT_MODE=off` in the deployed environment until IAM and full cutover are ready.

## Safe commit

```bash
cd ~/Dev/sadhana
git diff --check
git add backend/src/lambda.ts backend/src/m95DirectoryCompatibility.ts backend/src/routes/m95DirectoryRoutes.ts backend/test/m95DirectoryCompatibility.test.ts docs/database/M9_5_TEACHER_VENUE_DIRECTORY_INTEGRATION.md
git diff --cached --stat
git commit -m "feat: add M9.5 teacher and venue directory compatibility"
rm apply_m95_directories.py
```

Do not stage private migration reports, operational manifests, or AWS credentials.
