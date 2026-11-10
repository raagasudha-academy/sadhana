#!/usr/bin/env bash
# Read-only readiness check: does not enable SES, change Lambda or send messages.
set -euo pipefail
POOL="${1:-us-east-1_nyQjIQasG}"
REGION="${AWS_REGION:-us-east-1}"
echo '=== Cognito user pool email configuration (read only) ==='
aws cognito-idp describe-user-pool --user-pool-id "$POOL" --region "$REGION" \
 --query 'UserPool.{EmailConfiguration:EmailConfiguration,CustomMessage:LambdaConfig.CustomMessage,AutoVerifiedAttributes:AutoVerifiedAttributes}' \
 --output json --no-cli-pager
echo '=== SES account sending status (read only) ==='
aws sesv2 get-account --region "$REGION" \
 --query '{ProductionAccessEnabled:ProductionAccessEnabled,SendingEnabled:SendingEnabled,EnforcementStatus:EnforcementStatus}' \
 --output json --no-cli-pager
echo '=== SES verified identities (read only) ==='
aws sesv2 list-email-identities --region "$REGION" \
 --query 'EmailIdentities[].{IdentityName:IdentityName,VerificationStatus:VerificationStatus}' \
 --output table --no-cli-pager
printf '\nIMPORTANT: Do not attach the custom message trigger until EmailSendingAccount is DEVELOPER and SES delivery is verified.\n'
