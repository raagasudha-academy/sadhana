# AWS setup checklist for Sadhana — not yet deployed

**Before starting:** We need the AWS Region, a dedicated Sadhana Cognito User Pool and app client, and the eventual portal HTTPS origin. No account details or secrets are required in this chat.

1. Use a development AWS account/environment with an identity permitted to deploy SAM/CloudFormation. Keep production separate.
2. Create a dedicated **Cognito User Pool** for Sadhana staff. Disable self-registration, enable MFA, create a public app client, and assign invitation-only users to groups `raagasudha-admin`, `sruti-admin` as appropriate. Check your pool and client settings for OAuth authorization-code + PKCE for the later frontend integration. We haven't implemented login yet.
3. Confirm the portal's exact HTTPS origin. The API template restricts CORS to it. Do not use a public wildcard CORS origin.
4. Install the AWS CLI and SAM CLI locally; authenticate with an AWS profile or IAM Identity Center **without pasting access keys into chat or the frontend**.
5. This is a TypeScript project. Install dependencies in both packages, typecheck, then validate and rebuild from the project root:

   ```bash
   npm install
   npm run typecheck
   cd backend
   npm install
   npm run check
   cd ..
   sam validate --lint --template-file infra/template.yaml --region us-east-1
   sam build --template-file infra/template.yaml --region us-east-1
   ```

6. Do **not** deploy until the build is reviewed. Later, during a separately approved guided deployment, select your **dev** environment and supply `CognitoUserPoolId`, `CognitoAppClientId`, and `AllowedPortalOrigin`. Deploy only after reviewing CloudFormation resource changes. The development default for point-in-time recovery is **off** to minimise idle costs; turn it on for production after reviewing backup/restore and costs. DynamoDB deletion protection and CloudFormation `Retain` are enabled. For the development portal origin use `http://localhost:5173` (no trailing slash); replace with the exact HTTPS origin before production.
7. Record the API URL and table name from CloudFormation outputs. A direct unauthenticated request to `/api/me` must be rejected. An invited, authorised administrator should be able to call `/api/me` using an access token.
8. Test fictional records first. Verify that an Sruti-only administrator cannot read Raagasudha records, and that duplicate practice entries/cross-institution edits are blocked.
9. Once authentication and permissions are working, connect `src/api/sadhanaClient.ts` to the actual logged-in access token, replace demo identity selection with secure user identity, and swap demo state for backend read/write. **That integration is intentionally not activated in this delivery.**

## Note on deployment tooling

The SAM template and Lambda modules are written as a foundation; they were syntax-tested, but no AWS service access, Cognito user pool, infrastructure validation, or end-to-end deployment has occurred here. CloudFormation/IAM policy review and real integration tests remain necessary before using personal student data.

## Role mapping (important)

This updated backend expects Cognito groups exactly named `raagasudha-admin` and `sruti-admin` (matching the groups created in the console). It will deny API access to any user without one of these roles, even if the user can authenticate. These groups are **not IAM roles**.
