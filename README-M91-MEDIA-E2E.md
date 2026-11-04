# M9.1 isolated S3 media E2E

Run on your Mac from `~/Dev/sadhana/backend` after applying the ZIP:

```bash
python3 -m py_compile scripts/m91MediaE2E.py
python3 scripts/m91MediaE2E.py
python3 scripts/m91MediaE2E.py --apply
```

The default preflight is read-only. `--apply` requires separate parent and Raagasudha staff Cognito access tokens copied to the Mac clipboard (using `pbpaste`, each cleared immediately) and explicit typed confirmation. Do not paste tokens into chat. Use only the existing isolated API/Lambda. No new tables, existing enrolments or production changes.

The script creates one fresh, labelled teacher assignment and one parent submission with a generated 1-pixel PNG. It verifies a private signed S3 PUT, S3 HEAD receipt finalization, and independent signed GETs as parent and staff. It also expects denial for a Sruti request, an unknown student and an over-limit file. Signed URLs are never printed. Test records and media object remain in isolated M9 storage, and the script is NOT idempotent; after any partial failure, inspect records before retrying.

This tests only PNG media and selected denial paths. Real MP3/M4A, MP4, file limit combinations, revoked relationships, signed URL expiry and comprehensive cross-institution coverage remain outstanding. Full cutover is blocked until those tests and rollback pass.
