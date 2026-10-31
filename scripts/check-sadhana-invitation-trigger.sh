#!/usr/bin/env bash
set -euo pipefail
POOL="${1:?Usage: bash scripts/check-sadhana-invitation-trigger.sh <user-pool-id>}"
REGION="${AWS_REGION:-us-east-1}"
echo '=== Pool sending mode and Custom Message trigger ==='
aws cognito-idp describe-user-pool --user-pool-id "$POOL" --region "$REGION" --query 'UserPool.{Email:EmailConfiguration,CustomMessage:LambdaConfig.CustomMessage}' --output json
echo '=== SES account status ==='
aws sesv2 get-account --region "$REGION" --query '{ProductionAccessEnabled:ProductionAccessEnabled,SendingEnabled:SendingEnabled}' --output json
echo '=== SES identities ==='
aws sesv2 list-email-identities --region "$REGION" --query 'EmailIdentities[].{Name:IdentityName,Status:VerificationStatus}' --output table
echo '=== Note ==='
echo 'Branded CustomMessage email requires Cognito SES DEVELOPER sending, SES verified sender, and the custom-message Lambda attached to this pool.'
echo 'Main Sadhana API Lambda deployment does NOT deploy or attach this separate trigger.'
