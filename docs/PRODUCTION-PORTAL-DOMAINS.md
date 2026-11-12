# Production portal domains

The production portal will be hosted separately from the existing GitHub Pages dev portal. One CloudFront distribution serves the same built frontend under both production hostnames, so each hostname remains in the browser address bar:

- `https://sadhana.sruti.co.uk`
- `https://sadhana.raagasudhamusic.co.uk`

The GitHub Pages portal is moving to `https://sadhana-dev.sruti.co.uk` and keeps its existing dev API, dev Cognito client, and dev DynamoDB tables.

## Certificate and DNS stages

1. Request and validate an ACM certificate in `us-east-1` for the production hostnames.
2. Create the private S3 bucket and CloudFront distribution from `infra/prod-portal.yaml`.
3. Configure the GitHub Actions `production` environment variables for the prod Cognito client, prod API, AWS OIDC role, portal bucket, and distribution ID.
4. Deploy the portal manually through `Sadhana production portal release` and confirm the CloudFront default hostname works.
5. Change the Porkbun CNAME for `sadhana.sruti.co.uk` from GitHub Pages to the distribution hostname and add a CNAME for `sadhana.raagasudhamusic.co.uk` to the same distribution. Do this only after the portal and prod API have passed smoke checks.
6. Set the GitHub Pages custom domain to `sadhana-dev.sruti.co.uk` and ensure the dev Cognito callback/logout and dev API CORS configuration use that origin.

ACM's exact-host certificate request was blocked by the CAA policy inherited from GitHub Pages' CNAME target. The current replacement request covers `*.sruti.co.uk` and `*.raagasudhamusic.co.uk`; it can be attached to the distribution for the two selected hosts. Keep its DNS validation records in Porkbun for renewal.

The existing Pages workflow remains the dev deployment. The production workflow is manual and uploads only to its dedicated production bucket.
