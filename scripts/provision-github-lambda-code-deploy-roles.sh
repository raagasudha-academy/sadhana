#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="us-east-1"
ACCOUNT="627821644317"

actual_account="$(aws sts get-caller-identity --region "$REGION" --query Account --output text)"
[[ "$actual_account" == "$ACCOUNT" ]] || {
  echo "Refusing to provision roles in AWS account $actual_account." >&2
  exit 1
}

provision_role() {
  local name="$1" trust="$2" permissions="$3" environment="$4"
  if aws iam get-role --role-name "$name" >/dev/null 2>&1; then
    echo "Role $name already exists. Inspect its trust and attached policies before updating it." >&2
    return 1
  fi
  aws iam create-role \
    --role-name "$name" \
    --description "GitHub OIDC code-only deployment for Sadhana $environment" \
    --assume-role-policy-document "file://$trust" \
    --tags "Key=Project,Value=Sadhana" "Key=Environment,Value=$environment" >/dev/null
  aws iam put-role-policy \
    --role-name "$name" \
    --policy-name SadhanaLambdaCodeDeployment \
    --policy-document "file://$permissions"
  aws iam get-role --role-name "$name" \
    --query 'Role.{Name:RoleName,Arn:Arn,Trust:AssumeRolePolicyDocument}' \
    --output json
}

provision_role \
  sadhana-github-dev-code-deploy \
  "$ROOT/infra/iam/github-dev-code-deploy-trust.json" \
  "$ROOT/infra/iam/github-dev-code-deploy-permissions.json" \
  dev
provision_role \
  sadhana-github-prod-code-deploy \
  "$ROOT/infra/iam/github-prod-code-deploy-trust.json" \
  "$ROOT/infra/iam/github-prod-code-deploy-permissions.json" \
  prod
