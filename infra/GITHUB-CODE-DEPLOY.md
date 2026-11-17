# GitHub Actions code deployment

`.github/workflows/entrypoint.yaml` is the single workflow entry point for CI and releases.

- Pushes to any branch run the full verification jobs, then publish that commit to the shared dev portal and `dev-sadhana-api`.
- A push to `main` follows the same dev deployment. Only after both dev deployments and all checks succeed does the production portal/API job request approval from the `production` environment.
- Production IAM and Cognito/bootstrap operations remain explicit `workflow_dispatch` targets. They are not part of every main-branch release.
- The `github-pages` environment is intentionally configured without branch restrictions so pushed feature branches can deploy dev. Keep the `production` environment restricted to `main` and keep its required reviewer enabled.

## Required GitHub environment variables

The `github-pages` environment already contains the dev Cognito/API variables. Add:

| Variable | Value |
| --- | --- |
| `AWS_CODE_DEPLOY_ROLE_ARN` | `arn:aws:iam::627821644317:role/sadhana-github-dev-code-deploy` |

The `production` environment already contains `AWS_ROLE_ARN` for portal publication and the production portal variables. Add:

| Variable | Value |
| --- | --- |
| `AWS_CODE_DEPLOY_ROLE_ARN` | `arn:aws:iam::627821644317:role/sadhana-github-prod-code-deploy` |

These role ARNs are identifiers, not credentials. The workflow gets temporary AWS credentials through GitHub OIDC.

## AWS code-deploy roles

The trust documents restrict assumption to this repository's GitHub Actions environment. The inline policies allow only `GetFunction`, `GetFunctionConfiguration`, and `UpdateFunctionCode` on the matching stage Lambda. The production trust is limited to the protected `production` environment; production environment branch rules and reviewer approval must remain enabled.

After reviewing the trust and permission JSON files in `infra/iam`, run the provisioning script from an authenticated AWS CLI session in account `627821644317`:

```sh
bash scripts/provision-github-lambda-code-deploy-roles.sh
```

The script refuses to overwrite roles with those names. If either role already exists, inspect its trust and every attached/inline policy before making any change.
