# M9.1 Sruti public intake deployment — isolated-first

This is an infrastructure patch **to apply on your Mac**, not a claim that AWS has been changed. It depends on the previously installed `backend/src/m91SrutiIntakePublic.ts` and `backend/src/m91SrutiIntakeCore.mjs`.

## What it deploys

A **standalone** AWS API Gateway **REST** API at `/intake-test/register`, connected to the Sruti-only Lambda. It is completely separate from the existing JWT-protected M9 Lambda and API. IAM grants only `dynamodb:PutItem` to the *existing* `sadhana-dev-m9-registrations` table, no reads, scans, updates or deletes. Includes per-stage throttling (2 requests/sec sustained; burst 5), AWS WAF Regional CommonRuleSet and per-IP rate blocking (100 requests per evaluation window), HTTPS, 14-day Lambda log retention with no request-body logging, same-origin CORS allowlist and a disabled-by-default intake feature gate. The public frontend is not modified.

**Cost alert:** A REST API, AWS WAF ACL/rules, Lambda and logs have usage-based charges. WAF provides basic common-attack and IP-rate protections, not full bot verification or CAPTCHA. CORS and the browser Origin header alone do **not** authenticate requests; abuse is still possible. Restrict access or add stronger challenge protection before a high-volume production opening. WAF association may take a few minutes to propagate.

## On Mac — no writes by default

```bash
cd ~/Dev/sadhana
unzip -o ~/Downloads/sadhana-m91-sruti-public-deployment.zip -d .
bash scripts/deploy-sruti-public.sh
```

Verify account `627821644317`, region `us-east-1`, existing M9 registrations table, stack name, and costs. **Then intentionally create the isolated disabled stack:**

```bash
bash scripts/deploy-sruti-public.sh --apply
bash scripts/test-sruti-public.sh
```

Expected unauthenticated OPTIONS 204, POST 503 (intake disabled), GET 405, foreign-origin POST 403. Smoke creates **no records**.

The `--apply` command needs AWS permissions to create API Gateway REST, WAFv2 Regional, Lambda, IAM role, CloudWatch logs, CloudFormation stack and one private encrypted deployment S3 bucket. This is scoped to a new stack, and does **not** modify the protected API or existing DynamoDB items.

## Controlled next step after security approval

```bash
bash scripts/deploy-sruti-public.sh --enable
bash scripts/test-sruti-public.sh
```

When enabled, malformed POST becomes 400; known foreign origins are rejected 403. Before enabling the live Sruti site, send **one deliberately synthetic test registration**, validate its `SR-...` record as pending through the protected admin route, review/approve, preview and execute its import with limited gates, and confirm no guardian access is granted. Document removal/reset of the synthetic records. Test all three registration modes, browser CORS, retry/duplicate handling, and monitoring. Only after that, add GitHub Pages secret `VITE_SRUTI_REGISTRATION_API_URL` pointing to the verified public endpoint and redeploy Sruti. The website currently remains non-submitting.

Do **not** enable `M95_WEBSITE_IMPORT_WRITES` or `M91_SRUTI_REVIEW_WRITES` for production without isolated E2E approval. Keep the strict M9 fence and existing production Lambda untouched.

## Remaining M9.1 acceptance gates

1. Live proof of isolated public intake with WAF, CORS, throttling, write-only IAM and negative tests; verify no PII logs.
2. Sruti E2E: self, children, both, input validation, concurrent duplicate handling, review/version conflict, import, roll numbers, guardian pending access.
3. Sruti administrator UX and notifications, plus Cognito invitations/verification and revocation E2E.
4. Full-size MP3/M4A/MP4 homework media E2E, strict cross-institution authorization, audit and privacy review.
5. Rollback rehearsal, target/legacy data integrity checks and deliberate controlled production cutover. No automatic cutover.
