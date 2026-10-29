#!/usr/bin/env bash
set -euo pipefail

FUNCTION="sadhana-dev-SadhanaApiLambda-r891ZvuYQfPh"
REGION="us-east-1"
BACKUP="$HOME/Downloads/sadhana-lambda-backups/$(date -u +%Y%m%d-%H%M%S)-v1172"

cd "$HOME/Dev/sadhana"
mkdir -p "$BACKUP"

echo "1/5 Checking Lambda safety configuration..."

aws lambda get-function-configuration \
  --function-name "$FUNCTION" \
  --region "$REGION" \
  --output json > "$BACKUP/config-before.json"

python3 - "$BACKUP/config-before.json" <<'PY'
import json, sys
c=json.load(open(sys.argv[1]))
assert c["State"]=="Active", "Lambda is not active"
assert c["LastUpdateStatus"]=="Successful", "Previous update incomplete"
assert c["Handler"]=="lambda.handler", "Unexpected Lambda handler"
assert c["Runtime"]=="nodejs22.x", "Unexpected runtime"
v=c.get("Environment",{}).get("Variables",{})
for k in ("SADHANA_ENABLE_REVOKE_EXECUTION",
          "SADHANA_REVOKE_WRITER_FENCE_VERIFIED"):
    assert v.get(k)!="true", f"STOP: {k} enabled"
print("Safety configuration verified.")
PY

echo "2/5 Backing up deployed Lambda..."

URL=$(aws lambda get-function \
  --function-name "$FUNCTION" \
  --region "$REGION" \
  --query 'Code.Location' --output text)

curl -fsSL "$URL" -o "$BACKUP/sadhana-before.zip"
unzip -tq "$BACKUP/sadhana-before.zip" >/dev/null

echo "3/5 Building complete CommonJS Lambda..."

cd backend

npx esbuild src/lambda.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/lambda.cjs

node -e "if(typeof require('./dist/lambda.cjs').handler!=='function')process.exit(1)"

grep -q 'resend-parent-invitation' dist/lambda.cjs
grep -q 'revoke-preview' dist/lambda.cjs

echo "4/5 Packaging and deploying..."

mkdir -p "$BACKUP/package"
cp dist/lambda.cjs "$BACKUP/package/lambda.cjs"

printf "const app = require('./lambda.cjs');\nexports.handler = app.handler;\n" \
  > "$BACKUP/package/lambda.js"

(
  cd "$BACKUP/package"
  zip -q ../sadhana-updated.zip lambda.js lambda.cjs
)

aws lambda update-function-code \
  --function-name "$FUNCTION" \
  --region "$REGION" \
  --zip-file "fileb://$BACKUP/sadhana-updated.zip" \
  --query '{FunctionName:FunctionName,LastModified:LastModified,CodeSha256:CodeSha256}'

aws lambda wait function-updated \
  --function-name "$FUNCTION" \
  --region "$REGION"

echo "5/5 Verifying deployment..."

aws lambda get-function-configuration \
  --function-name "$FUNCTION" \
  --region "$REGION" \
  --output json > "$BACKUP/config-after.json"

python3 - "$BACKUP/config-before.json" "$BACKUP/config-after.json" <<'PY'
import json, sys
before, after=[json.load(open(p)) for p in sys.argv[1:]]
assert after["State"]=="Active"
assert after["LastUpdateStatus"]=="Successful"
assert before.get("Environment")==after.get("Environment"), \
    "WARNING: Lambda environment changed"
assert before["Role"]==after["Role"], "WARNING: Lambda role changed"
print("DEPLOYMENT SUCCESSFUL")
print("Environment and IAM role preserved.")
print("Revocation remains disabled.")
PY

echo "ROLLBACK: $BACKUP/sadhana-before.zip"
