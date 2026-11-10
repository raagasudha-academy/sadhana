# M9.1 Middlesbrough controlled enrolment

Source-of-truth evidence on 2026-11-04: class `CLASS-RAAGA-MIDDLESBROUGH` active, teacher `TEACHER-540b1a18-5df6-45de-a343-93a3f88e432d` validated, and both Raagasudha students `001-001`, `001-002` without enrolments.

## Safety

`middlesbroughEnrol.py` defaults to read-only preflight. `--apply` writes only after explicitly typing `ENROL BOTH M91` and passing a second live preflight. A single DynamoDB transaction creates two active enrolments and two audit records, conditional on existing class/teacher/student identity records. IDs are deterministic and existing class enrolments block reruns. The script does not modify classes, teachers, venues, family links, or Cognito; it does not alter Lambda configuration, IAM, or production routing. These are **M9 test enrolments for real imported records** and should be explicitly reviewed before any final data transfer or production cutover.

## Run

```bash
cd ~/Dev/sadhana/backend
python3 -m unittest discover -s test -p 'test_m91_middlesbrough*.py' -v
python3 scripts/middlesbroughEnrol.py
# If the preflight has no blockers and you authorize creating both test enrolments:
python3 scripts/middlesbroughEnrol.py --apply
python3 scripts/enrolmentPreview.py
```

The existing `~/Downloads/m9_guardian_dashboard_test.py` can then be rerun with a fresh parent access token to verify two visible class enrolments and guardian authorization. Its earlier 4/4 access test should still pass. Clear clipboard after testing. Enrolments alone do not prove practice, homework, submissions or S3 media E2E; these still need independent deployed tests and evidence.

## Notes

The AWS CLI caller must have DynamoDB `TransactWriteItems` and item-level write permissions for M9 enrolments and audit. No policy adjustments are included in this package. If permission is denied, stop rather than broadening IAM without review.

No automatic cleanup is included because other test activity could reference an enrolment. A separate dependency-aware cleanup/revocation workflow is required after learning E2E.
