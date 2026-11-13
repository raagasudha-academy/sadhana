# Production bootstrap settings

The backend bootstrap workflow is `.github/workflows/prod-backend-bootstrap.yml`. It runs
verification first and requests approval through GitHub's `production` environment before
assuming an AWS role. Keep the existing required reviewer rule enabled.

## AWS role trust

Create a dedicated GitHub IAM role and a separate CloudFormation execution role. Do not reuse
the Sruti-bot deployment role; its trust is restricted to a different repository. The account
already has the GitHub OIDC provider
`arn:aws:iam::627821644317:oidc-provider/token.actions.githubusercontent.com`.

Use `infra/github-production-bootstrap-trust.json` as the GitHub role trust policy and attach
`infra/iam/github-production-bootstrap-permissions.json`. The subject is restricted to
`raagasudha-academy/sadhana` jobs that declare the `production` environment. It accepts both
the classic name-based subject and GitHub's immutable organization/repository ID subject, each
restricted to that same environment. Its permissions are limited to the three new production
stacks, passing only the dedicated CloudFormation role,
reading the current production Cognito pool and Sruti table metadata, and packaging artifacts in
the production deployment bucket. Do not attach `AdministratorAccess` or grant this GitHub role
access to development resources or DynamoDB item contents.

Create the CloudFormation role `prod-sadhana-cloudformation-execution` with trust from
`infra/iam/prod-cloudformation-execution-trust.json` and permissions from
`infra/iam/prod-cloudformation-execution-permissions.json`. Create the two execution-role
permissions boundaries from `infra/iam/sadhana-prod-lambda-boundary.json` and
`infra/iam/sruti-prod-intake-boundary.json` first. The app and intake templates apply the
boundaries only for `Stage=prod`; the deployment policy requires those exact boundaries for all
Lambda roles it creates or passes. Review CloudFormation change sets before approving the
environment job.

## GitHub environment

In repository **Settings → Environments → production**, keep the required reviewer protection
and add these environment variables after the IAM role exists:

| Variable                            | Value                                               |
| ----------------------------------- | --------------------------------------------------- |
| `AWS_ROLE_ARN`                      | ARN of the dedicated Sadhana GitHub OIDC role       |
| `AWS_REGION`                        | `us-east-1`                                         |
| `CLOUDFORMATION_EXECUTION_ROLE_ARN` | ARN of `prod-sadhana-cloudformation-execution` role |

These are configuration values, not secrets. Do not add AWS access keys. The workflow checks
that the assumed role belongs to account `627821644317` and supplies the execution role to each
production CloudFormation deployment.

API Gateway's IAM control-plane ARNs identify APIs by generated API ID rather than by name.
The execution policy therefore scopes those control-plane actions to `us-east-1`; the GitHub
role can use the execution role only on the three named production stacks.

## Run

Create the CloudFormation execution role and boundary policies with the AWS administrator
session, attach the GitHub policy to the OIDC role, and set all three environment variables
above before dispatching the workflow.

After this branch is merged or pushed to `main`, run **Sadhana production backend bootstrap**
from **Actions → Run workflow**. The workflow runs the frontend, backend, Python, and production
table-name checks before the protected `bootstrap` job can request approval. That job creates
the prefixed production tables, Sadhana API resources, and a disabled Sruti intake stack. It
does not copy selected development data, publish the portal, or switch the live Sruti intake.

The portal release remains blocked until production data, authenticated canaries, intake
routing, and rollback checks are verified.
