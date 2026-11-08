# M9.1 learning integration runner

This patch adds **only a guarded local E2E runner and tests**. It does not deploy Lambda code, change configuration, create records, or enable any write flags.

Run:

```sh
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m91-learning-e2e.zip -d ~/Dev/sadhana
cd backend
python3 -m unittest discover -s test -p 'test_learning_runner.py' -v
python3 scripts/learningE2E.py
```

The default command is **read-only**, checks the exact account and isolated Lambda guards, and reports `M9_LEARNER_WRITES` and `M9_HOMEWORK_WRITES`. Do not run `--apply` if those are disabled. If they are enabled, review test-record implications and use `--apply` to submit a deliberate test against the already-approved parent and assigned teacher/admin. The script prompts for tokens locally, prints neither, and requires a second confirmation before writes.

## Known blocker: M9 media is not yet implemented

The repository snapshot contains explicit rejection in `backend/src/legacyHomework.ts`: nonempty submission `attachmentIds` return HTTP 503. `backend/src/routes/homeworkRoutes.ts` also returns 503 for unmigrated media paths. The strict legacy fence must remain enabled. **Do not use legacy media routes or mark S3 upload E2E as passed.** The remaining media integration requires a new M9-native, authorized metadata/presigned upload design, tests, and an isolated deployment before media E2E can run.

## Caveats

Practice is deterministic per student/class/date; `--apply` will fail with a conflict if an entry already exists for today. Successful `--apply` creates deliberately labeled records in existing M9 tables; there is no automatic cleanup, to retain auditability. No new tables, students, classes, or enrolments are created. The teacher/admin token must be a genuine approved staff token in the same institution; a random guardian token is rejected by backend authorization.
