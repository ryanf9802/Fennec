# Fennec deployment and releases

This is the operator runbook for the Fennec web deployment and signed Windows
companion releases.

## Web infrastructure

AWS infrastructure is defined in TypeScript CDK and pinned to personal account
`309418039962`. `FennecSite` creates a private S3 origin, CloudFront Origin
Access Control, SPA routing, security headers, ACM and Route 53 records, and a
permanent `fennec.gg` to `app.fennec.gg` redirect.

The distribution uses AWS-managed caching and dedicated CloudFront Functions so
it remains compatible with CloudFront's flat-rate Free plan. The deployment
fails before assuming AWS credentials unless `AWS_ACCOUNT_ID` is exactly
`309418039962`; CDK also rejects every other explicit account ID.

`FennecCiAccess` creates a GitHub OIDC role restricted to this repository's
immutable owner and repository IDs and the `main` branch. If a repository
transfer changes GitHub's OIDC subject, set `FENNEC_GITHUB_OIDC_SUBJECT` to the
complete observed `sub` claim when redeploying the access stack.

## Establish deployment access

1. Configure a personal AWS CLI profile and bootstrap CDK in `us-east-1`.
2. Set `AWS_ACCOUNT_ID` locally and deploy the access stack once:

   ```bash
   AWS_ACCOUNT_ID=309418039962 AWS_REGION=us-east-1 \
     pnpm cdk deploy FennecCiAccess --profile fennec
   ```

3. Add these GitHub repository variables:

   | Variable                 | Value                            |
   | ------------------------ | -------------------------------- |
   | `AWS_ACCOUNT_ID`         | Personal 12-digit AWS account ID |
   | `AWS_REGION`             | `us-east-1`                      |
   | `FENNEC_APP_DOMAIN`      | `app.fennec.gg`                  |
   | `FENNEC_REDIRECT_DOMAIN` | `fennec.gg`                      |
   | `FENNEC_ZONE_NAME`       | `fennec.gg`                      |
   | `FENNEC_HOSTED_ZONE_ID`  | Route 53 public hosted-zone ID   |

4. Dispatch `.github/workflows/ci.yml` on `main` or push to `main`. The workflow
   assumes `FennecGitHubDeployRole`, deploys `FennecSite`, publishes `dist`,
   invalidates CloudFront, and smoke-tests the URL.
5. In CloudFront, subscribe the distribution to the Free flat-rate plan and
   attach the `fennec.gg` hosted zone. Do not enable paid add-ons or separately
   billed logging.
6. Copy the plan WAF ARN into the `FENNEC_WEB_ACL_ARN` repository variable and
   dispatch the workflow again. CloudFormation then declares the plan-managed
   association so later deployments do not drift.

If the AWS account already contains GitHub Actions' OIDC provider, set
`GITHUB_OIDC_PROVIDER_ARN` while deploying `FennecCiAccess` so CDK imports it
instead of creating a duplicate.

## Web CI and deployment

`.github/workflows/ci.yml` validates pushes and pull requests with formatting,
lint, typechecking, unit tests, a web build, CDK synthesis, and responsive
Playwright tests. It retains the web build as a workflow artifact.

The `main` branch accepts changes only through pull requests. Every pull request
must have current successful `Web validation` and `Windows companion gate`
checks. Contributor pull requests also require approval from the repository
code owner; authors cannot approve their own changes. Repository administrators
may bypass only the review requirement from within a pull request, so solo
maintainer changes still use a green PR and direct pushes remain blocked.

On a push or manual dispatch from `main`, the deployment job assumes the OIDC
role, deploys the CDK site stack, synchronizes immutable assets and non-cached
application entry files separately, invalidates CloudFront, and smoke-tests the
deployed site URL.

## Companion validation and releases

`.github/workflows/companion.yml` validates pull requests and manual dispatches.
It always reports `Windows companion gate` on pull requests, but runs the
Windows build only when companion or release inputs changed. The Windows job
builds the web application, runs `cargo test --locked`, builds the current-user
NSIS installer, and retains the installer as an artifact. Branch pushes rely on
the local pre-push gate until a pull request exists, avoiding duplicate CI runs.

`.github/workflows/release-companion.yml` releases companion-related changes
from `main`. It derives a patch version from the GitHub workflow run number,
builds and tests the application, and publishes a
`companion-v<version>` GitHub release containing the stable installer, signed
NSIS updater archive, and `latest.json`. The checked-in package major and minor
version define the release train; its patch component is reserved for CI. No
manual tag is required.

## Companion updater signing

`FennecCiAccess` owns a retained, rotation-enabled KMS key with alias
`alias/fennec-companion-updater`. The `main`-only GitHub OIDC role can decrypt
one SSM SecureString parameter: `/fennec/companion/updater-signing`. The release
workflow reads the parameter directly; signing material is not duplicated in
GitHub secrets.

Provision the parameter once after generating the updater key pair:

```bash
pnpm tauri signer generate --write-keys updater.key
```

The command writes `updater.key` and `updater.key.pub`. Put the public-key
contents in `src-tauri/tauri.conf.json`. Base64-encode the complete encrypted
`updater.key` file without line wrapping, then create
`updater-signing.json` with this shape:

```json
{
  "privateKeyBase64": "<base64 of the encrypted Tauri private-key file>",
  "password": "<private-key password>"
}
```

Store it as a SecureString encrypted by the updater KMS alias:

```bash
aws ssm put-parameter \
  --profile fennec \
  --region us-east-1 \
  --name /fennec/companion/updater-signing \
  --type SecureString \
  --key-id alias/fennec-companion-updater \
  --value file://updater-signing.json
```

For disaster recovery, retrieve it only into a protected local file and never
print it into CI or shared terminal logs:

```bash
umask 077
aws ssm get-parameter \
  --profile fennec \
  --region us-east-1 \
  --name /fennec/companion/updater-signing \
  --with-decryption \
  --query Parameter.Value \
  --output text > updater-signing-recovery.json
```

Do not replace the Tauri signing key during ordinary maintenance. Installed
companions pin its public key and reject releases signed with another key. AWS
KMS automatic rotation is safe because it re-encrypts the SSM value without
changing the updater signing identity.
