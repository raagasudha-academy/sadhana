#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION="sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh"
REGION="us-east-1"
ACCOUNT="627821644317"
MODE="${1:---execute}"
BACKUP_ROOT="${SADHANA_LAMBDA_BACKUP_DIR:-$HOME/Downloads/sadhana-lambda-backups}"

case "$MODE" in
  --execute|--dry-run) ;;
  *) echo 'Usage: npm run deploy:backend [-- --dry-run|--execute]' >&2; exit 2 ;;
esac

for command in aws curl unzip zip python3 node npm; do
  command -v "$command" >/dev/null || { echo "Required command not found: $command" >&2; exit 1; }
done

echo "Checking AWS account and target Lambda ($REGION)..."
ACTUAL_ACCOUNT="$(aws sts get-caller-identity --region "$REGION" --query Account --output text)"
[[ "$ACTUAL_ACCOUNT" == "$ACCOUNT" ]] || { echo "Wrong AWS account: $ACTUAL_ACCOUNT" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CONFIG_BEFORE="$WORK/config-before.json"
aws lambda get-function-configuration \
  --function-name "$FUNCTION" --region "$REGION" --output json > "$CONFIG_BEFORE"

python3 - "$CONFIG_BEFORE" "$FUNCTION" <<'PY'
import json, sys
config=json.load(open(sys.argv[1]))
assert config.get('FunctionName') == sys.argv[2], 'Unexpected Lambda identity'
assert config.get('State') == 'Active', 'Lambda is not active'
assert config.get('LastUpdateStatus') == 'Successful', 'Previous Lambda update is incomplete'
assert config.get('Runtime') == 'nodejs22.x', 'Unexpected Lambda runtime'
assert config.get('Handler') == 'lambda.handler', 'Unexpected Lambda handler'
variables=config.get('Environment',{}).get('Variables',{})
for key in ('SADHANA_ENABLE_REVOKE_EXECUTION','SADHANA_REVOKE_WRITER_FENCE_VERIFIED'):
    assert variables.get(key) != 'true', f'STOP: {key} is enabled'
print('Account, function identity, runtime, handler, and safety flags verified.')
PY

echo 'Running backend typecheck and regression suites...'
npm --prefix "$ROOT/backend" run check
echo 'Building the backend Lambda bundle...'
npm --prefix "$ROOT/backend" run build

ARTIFACT="$ROOT/backend/dist/lambda.mjs"
[[ -s "$ARTIFACT" ]] || { echo "Lambda bundle missing: $ARTIFACT" >&2; exit 1; }
node --input-type=module - "$ARTIFACT" <<'JS'
const path = process.argv[2];
const module = await import(`file://${path}`);
if (typeof module.handler !== 'function') throw new Error('Built bundle does not export handler');
JS

mkdir -p "$WORK/package"
cp "$ARTIFACT" "$WORK/package/lambda.mjs"
(cd "$WORK/package" && zip -q "$WORK/sadhana-lambda.zip" lambda.mjs)
unzip -tq "$WORK/sadhana-lambda.zip" >/dev/null
EXPECTED_ZIP_SHA="$(python3 - "$WORK/sadhana-lambda.zip" <<'PY'
import base64,hashlib,sys
print(base64.b64encode(hashlib.sha256(open(sys.argv[1],'rb').read()).digest()).decode())
PY
)"

if [[ "$MODE" == "--dry-run" ]]; then
  echo "Dry run passed. Target: $FUNCTION ($REGION), bundle SHA256: $EXPECTED_ZIP_SHA"
  echo 'No AWS resources or code were changed.'
  exit 0
fi

echo "About to update code only on $FUNCTION in account $ACCOUNT."
echo 'This command does not deploy CloudFormation or change Lambda environment, IAM, API routes, or database resources.'
read -r -p "Type DEPLOY $FUNCTION to continue: " CONFIRM
[[ "$CONFIRM" == "DEPLOY $FUNCTION" ]] || { echo 'Deployment cancelled.'; exit 1; }

STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP"
cp "$CONFIG_BEFORE" "$BACKUP/config-before.json"
URL="$(aws lambda get-function --function-name "$FUNCTION" --region "$REGION" --query 'Code.Location' --output text)"
curl -fsSL "$URL" -o "$BACKUP/lambda-before.zip"
unzip -tq "$BACKUP/lambda-before.zip" >/dev/null
cp "$WORK/sadhana-lambda.zip" "$BACKUP/lambda-after.zip"

echo 'Updating Lambda code...'
aws lambda update-function-code \
  --function-name "$FUNCTION" --region "$REGION" \
  --zip-file "fileb://$WORK/sadhana-lambda.zip" \
  --query '{FunctionName:FunctionName,LastModified:LastModified,CodeSha256:CodeSha256}'
aws lambda wait function-updated --function-name "$FUNCTION" --region "$REGION"

CONFIG_AFTER="$BACKUP/config-after.json"
aws lambda get-function-configuration \
  --function-name "$FUNCTION" --region "$REGION" --output json > "$CONFIG_AFTER"
python3 - "$CONFIG_BEFORE" "$CONFIG_AFTER" "$FUNCTION" "$EXPECTED_ZIP_SHA" <<'PY'
import json,sys
before,after=[json.load(open(p)) for p in sys.argv[1:3]]
assert after.get('FunctionName') == sys.argv[3]
assert after.get('State') == 'Active' and after.get('LastUpdateStatus') == 'Successful'
assert after.get('CodeSha256') == sys.argv[4], 'Deployed code hash does not match the reviewed local bundle'
assert before.get('Environment') == after.get('Environment'), 'Lambda environment changed'
assert before.get('Role') == after.get('Role'), 'Lambda execution role changed'
assert before.get('Handler') == after.get('Handler'), 'Lambda handler changed'
assert before.get('Runtime') == after.get('Runtime'), 'Lambda runtime changed'
print('DEPLOYMENT VERIFIED: code hash matches; environment, role, handler, and runtime are unchanged.')
PY
echo "Rollback bundle: $BACKUP/lambda-before.zip"
