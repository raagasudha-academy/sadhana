#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
POOL="${SADHANA_USER_POOL_ID:-us-east-1_nyQjIQasG}"
echo 'Cognito email setup (read-only):'
aws cognito-idp describe-user-pool --user-pool-id "$POOL" --region "$REGION" --query 'UserPool.{Email:EmailConfiguration,CustomMessage:LambdaConfig.CustomMessage}' --output json --no-cli-pager
echo 'SES sending status (read-only):'
aws sesv2 get-account --region "$REGION" --query '{ProductionAccessEnabled:ProductionAccessEnabled,SendingEnabled:SendingEnabled}' --output json --no-cli-pager
echo 'Sender identities (read-only):'
aws sesv2 list-email-identities --region "$REGION" --query 'EmailIdentities[].{Name:IdentityName,Status:VerificationStatus}' --output table --no-cli-pager
echo 'No emails were sent; branded delivery needs an explicitly authorized live test.'
