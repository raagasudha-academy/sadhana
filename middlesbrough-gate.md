# M9.1 Middlesbrough class assignment verification

Selected by the operator for both imported Raagasudha students:

- `001-001`: `CLASS-RAAGA-MIDDLESBROUGH`
- `001-002`: `CLASS-RAAGA-MIDDLESBROUGH`

## Run after applying this overlay

```sh
cd ~/Dev/sadhana/backend
python3 -m unittest discover -s test -p 'test_middlesbrough_gate.py' -v
python3 scripts/middlesbroughGate.py
```

This is a **read-only** check of the live M9 DynamoDB class, `teacherPersonIds`, teacher Person records, both student Person records, and existing enrolments. It verifies the AWS account before reading. It prints only IDs and status, not teacher/child personal contact details.

**Do not create enrolments if any blocker appears.** A passing output is necessary but not sufficient: the class and real teacher assignment must also be confirmed as the intended assignment by the academy, and an explicitly authorized, audited, reversible test enrolment operation must be separately implemented and reviewed.

No DynamoDB writes, Lambda changes, Cognito actions, IAM changes, production routing, new tables or duplicate imports are included. Other M9.1 learning, Sruti and rollback E2E tests are still pending.
