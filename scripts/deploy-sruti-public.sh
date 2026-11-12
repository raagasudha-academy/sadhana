#!/usr/bin/env bash
set -euo pipefail
# DRY RUN by default. --apply creates an isolated REST API stack with disabled intake.
# --enable separately permits writes. Only after a reviewed no-PII smoke test.
MODE="${1:---dry-run}"
case "$MODE" in --dry-run|--apply|--enable) ;; *) echo 'Usage: bash scripts/deploy-sruti-public.sh [--dry-run|--apply|--enable]' >&2; exit 2;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
TEMPLATE="$ROOT/infra/sruti-public-intake.yml"
REGION=us-east-1
ACCOUNT=627821644317
STAGE="${SADHANA_STAGE:-dev}"
case "$STAGE" in dev|staging|prod) ;; *) echo 'SADHANA_STAGE must be dev, staging, or prod' >&2; exit 2;; esac
STACK="sadhana-${STAGE}-sruti-public-intake"
TABLE="sruti-${STAGE}-student-registrations"
[[ "$STAGE" == prod ]] && TABLE=sruti-student-registrations
if [[ "$MODE" == --enable && "$STAGE" != prod ]]; then
  echo 'Live public registration intake can only be enabled for prod; dev accepts sanitized test records through controlled seeding.' >&2
  exit 2
fi
command -v aws >/dev/null || { echo 'AWS CLI required' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js required' >&2; exit 1; }
ACTUAL="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
[[ "$ACTUAL" == "$ACCOUNT" ]] || { echo "Wrong AWS account: $ACTUAL" >&2; exit 1; }
aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" --query 'Table.TableStatus' --output text | grep -qx ACTIVE || { echo 'Stage Sruti source table not ACTIVE' >&2; exit 1; }
[[ -f "$BACKEND/src/srutiIntakePublic.ts" ]] || { echo 'Missing Sruti public intake handler' >&2; exit 1; }
[[ -f "$TEMPLATE" ]] || { echo 'Missing infra template' >&2; exit 1; }
if [[ "$MODE" == --dry-run ]]; then
  echo "DRY RUN: account=$ACTUAL region=$REGION stage=$STAGE stack=$STACK source-table=$TABLE"
  echo 'Resources: isolated Lambda, API Gateway REST, restricted PutItem role, throttling, WAF common+IP rules, 14-day logs.'
  echo 'Public intake stays disabled on --apply; --enable is prod-only.'
  echo 'WAF + REST API incur AWS charges. No live website settings or protected Lambda changed.'
  exit 0
fi
# First deployment is always disabled; --enable requires existing deployed stack.
if [[ "$MODE" == --enable ]]; then
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" >/dev/null || { echo 'Deploy disabled stack before enabling' >&2; exit 1; }
fi
ENABLED=disabled
[[ "$MODE" == --enable ]] && ENABLED=enabled
# Avoid stale assets by keying each immutable code bundle by hash.
(cd "$BACKEND" && npx --no-install esbuild src/srutiIntakePublic.ts --bundle --platform=node --target=node22 --format=esm --outfile=/tmp/sadhana-sruti-intake-index.mjs --external:@aws-sdk/*)
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cp /tmp/sadhana-sruti-intake-index.mjs "$WORK/index.mjs"
(cd "$WORK" && zip -q intake.zip index.mjs)
KEY="sruti-intake/$(shasum -a 256 "$WORK/intake.zip" | awk '{print $1}').zip"
BUCKET="sadhana-${STAGE}-intake-deploy-${ACCOUNT}-${REGION}"
if ! aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" --region "$REGION" --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
  aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
fi
aws s3 cp "$WORK/intake.zip" "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors
aws cloudformation deploy --region "$REGION" --stack-name "$STACK" --template-file "$TEMPLATE" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "Stage=$STAGE" "CodeBucket=$BUCKET" "CodeKey=$KEY" "IntakeEnabled=$ENABLED" "SourceTableName=$TABLE"
echo 'Intake endpoint (test stage only):'
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query 'Stacks[0].Outputs[?OutputKey==`PublicIntakeUrl`].OutputValue|[0]' --output text
printf 'IntakeEnabled=%s\n' "$ENABLED"
