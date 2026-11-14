#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="627821644317"
MODE="${1:---dry-run}"

case "$MODE" in
  --dry-run|--apply) ;;
  *) echo 'Usage: npm run deploy:dev:tables [-- --dry-run|--apply]' >&2; exit 2 ;;
esac

[[ "$REGION" == us-east-1 ]] || { echo "Unexpected AWS region: $REGION" >&2; exit 1; }
for command in aws node; do
  command -v "$command" >/dev/null || { echo "Required command not found: $command" >&2; exit 1; }
done

ACTUAL_ACCOUNT="$(aws sts get-caller-identity --region "$REGION" --query Account --output text)"
[[ "$ACTUAL_ACCOUNT" == "$ACCOUNT" ]] || { echo "Wrong AWS account: $ACTUAL_ACCOUNT" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
TEMPLATE="$WORK/dev-sadhana-tables.json"
node "$ROOT/backend/scripts/prodEntityTablesTemplate.mjs" --stage dev --output "$TEMPLATE"
aws cloudformation validate-template --region "$REGION" --template-body "file://$TEMPLATE" >/dev/null

if [[ "$MODE" == --dry-run ]]; then
  echo "DRY RUN: create or update dev-sadhana-entity-tables in account $ACCOUNT, region $REGION."
  echo 'The template retains existing tables and creates the 18 canonical Sadhana tables plus two stage-specific intake tables.'
  exit 0
fi

echo 'Applying additive table infrastructure. Existing middle-prefix tables will remain untouched.'
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name dev-sadhana-entity-tables \
  --template-file "$TEMPLATE" \
  --no-fail-on-empty-changeset \
  --tags Application=Sadhana Environment=dev
echo 'Development environment-first entity and intake tables are ready.'
