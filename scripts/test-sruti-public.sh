#!/usr/bin/env bash
set -euo pipefail
REGION=us-east-1
STACK=sadhana-m91-sruti-public-intake
URL="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`PublicIntakeUrl`].OutputValue|[0]' --output text)"
[[ "$URL" == https://* ]] || { echo 'Could not load endpoint' >&2; exit 1; }
echo "Checking $URL (synthetic invalid request only; no personal data sent)"
for METHOD in OPTIONS POST GET; do
  if [[ "$METHOD" == POST ]]; then
    STATUS="$(curl -sS -o /tmp/sruti-public-smoke.json -w '%{http_code}' -X POST "$URL" -H 'Origin: https://sruti.co.uk' -H 'Content-Type: application/json' --data '{}')"
  else
    STATUS="$(curl -sS -o /tmp/sruti-public-smoke.json -w '%{http_code}' -X "$METHOD" "$URL" -H 'Origin: https://sruti.co.uk')"
  fi
  echo "$METHOD status=$STATUS"
  [[ "$METHOD" != OPTIONS || "$STATUS" == 204 ]] || exit 1
  [[ "$METHOD" != GET || "$STATUS" == 405 ]] || exit 1
  [[ "$METHOD" != POST || "$STATUS" == 503 || "$STATUS" == 400 ]] || exit 1
done
STATUS="$(curl -sS -o /tmp/sruti-public-smoke.json -w '%{http_code}' -X POST "$URL" -H 'Origin: https://not-sruti.example' -H 'Content-Type: application/json' --data '{}')"
echo "Foreign-origin POST status=$STATUS"
[[ "$STATUS" == 403 ]] || exit 1
echo 'Smoke passed. No DynamoDB items were created.'
