# M9.1 consolidated integration work (source patch, NOT cutover)

This archive is an overlay for `~/Dev/sadhana`. It deliberately does **not** create tables, re-import families, provision Cognito accounts, alter production APIs or change AWS resources automatically.

## Included and locally tested

- Version-controlled isolated execution IAM policy (`backend/scripts/m91IsolatedPolicy.py`) incorporating the three verified manual permission additions.
- Existing *create-only* isolated deployment script now sources that policy. **Do not rerun** it for the already-created Lambda; it intentionally refuses existing resources.
- Read-only IAM drift auditor (`backend/scripts/m91IsolatedIamAudit.py`). Compares exact permissions, including unexpected privileges, and checks that the strict fence is on and identity-link writes are off.
- Read-only controlled enrolment preview (`backend/scripts/m91EnrolmentPreview.py`). Finds existing Raaga classes and checks the two students' enrolments without modifying data.
- Regression coverage for the versioned policy and corresponding updated old test.

## Apply and verify on your Mac

```sh
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m91-integration-patch.zip -d ~/Dev/sadhana
cd backend
python3 -m unittest discover -s test -p 'test_m9*.py' -v
npm run check
npm run build
python3 scripts/m91IsolatedIamAudit.py
python3 scripts/m91EnrolmentPreview.py
```

The Python tests passed in the authoring environment (8/8). Node dependencies and live AWS credentials were unavailable here; `npm run check`, `npm run build` and the two AWS read-only checks must be run on the Mac.

## Consolidated remaining test work — NOT YET VERIFIED

1. Select class IDs from the enrolment preview, verify the corresponding existing teacher and class status, and create **reversible, explicitly authorised** test enrolments for the two already-imported students, with audit records.
2. Exercise deployed teacher homework publish/read/edit, enrolled guardian/student practice and RSVP, submission/feedback, signed media PUT/GET and S3 metadata. Test denied non-enrolled access and revocation.
3. Exercise the **Sruti website** registration form's child/self/both paths through approval, import and sync; use a disposable test registration, never re-import the known Raaga family.
4. Finish authenticated Raaga↔Sruti negative authorization, other-family denials, role enforcement and revoked-link denial checks.
5. Exercise Cognito invitation/resend, existing-user identity conflict, new-user acceptance and revoked access in isolated mode with explicit test accounts.
6. Exercise a **nonproduction** rollback with state-parity/reconciliation checks. Production routing remains untouched.
7. Fill `backend/docs/database/m9-cutover-evidence.template.json` only from actual recorded results and run the existing `m9CutoverGate.mjs`. The gate is read-only and cannot perform production cutover.

## Known completed live evidence supplied by the operator

- 18 M9 tables, 461 preserved operational records, 7 teachers.
- Existing family `001` with imported students `001-001` and `001-002`; no re-import.
- Existing Cognito guardian identity linked; protected independent approvals returned HTTP 200, records show version 2 and verified status.
- Guardian token successfully accessed **both** learner dashboards; 4/4 access cases passed, including an unknown student and a Sruti institution denial.

These facts establish guardian E2E for those cases, **not** any of the remaining numbered workflows above. Cutover remains NO-GO.

## Safety

The IAM policy is the current **isolated** policy, not a replacement for the existing `infra/template.yaml` production stack. That stack explicitly grants legacy-table access and must not be edited to add isolated M9 permissions. Review isolated IAM scope before eventual production IaC separation. Do not grant legacy DynamoDB access to the isolated Lambda.
