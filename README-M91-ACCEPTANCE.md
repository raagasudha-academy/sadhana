# Sadhana M9.1 — acceptance and release blockers

**Production NO-GO.** This package is source inspection and rejection-only testing. It does not implement the missing Sruti onboarding adapter or prove Cognito/rollback workflows.

## Apply

From `~/Dev/sadhana`:

```sh
unzip -o ~/Downloads/sadhana-m91-final-acceptance.zip -d ~/Dev/sadhana
cd backend
python3 -m unittest discover -s test -p 'test_m91_final_acceptance.py' -v
python3 scripts/m91ReleaseBlockerAudit.py
python3 scripts/m91FinalAcceptance.py
```

The last two commands are read-only. They should report the **Sruti import blocker** and the isolated Lambda readiness respectively.

## Optional, rejected-request-only media test

This step does NOT create homework, media receipts, submissions, S3 objects, student enrolments or new identities. It uses the previously created test homework `HOMEWORK-ff753767-e0e7-43d5-995e-e4c1ee2ad560` and sends only requests designed to fail with HTTP 400/403. If any test unexpectedly succeeds, **stop** and inspect the returned record manually before continuing.

```sh
python3 scripts/m91FinalAcceptance.py --negative-media
```

At the prompt, copy a **fresh parent ACCESS token** to your Mac clipboard and press Return. The script reads with `pbpaste`, clears the clipboard and verifies the expected parent identity. Then enter `RUN REJECTION TESTS` to execute nine rejections. Do not paste tokens or presigned URLs into ChatGPT.

This is intentionally *not* a positive 20 MB audio or 100 MB video upload test; no large file uploads are performed. File-limit combinations, content type validation on physical upload, signed URL expiry, revoked-link access and end-to-end Sruti onboarding remain to implement/test.

## Critical finding — Sruti importer

`backend/src/m95WebsiteImport.ts` explicitly blocks `inst !== 'raaga'`, and `/reconcile` also restricts to Raagasudha with `RS-` IDs. Do not remove these guards until the Sruti website's actual approved registration payload, import idempotency, student/self/guardian cases, institution-scoped counter allocations and website-state reconciliation are implemented and tested. Do not manufacture registrations or bypass the website approval workflow.

## Cutover

Production remains unchanged. Preserve strict legacy fence, keep provisioning off, preserve the 461 operational records, verify all deployed E2E evidence, and rehearse rollback with a defined reconciliation plan for M9-only writes. The cutover gate is documentary; a human must still authorize any production routing change.
