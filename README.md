# Fennec

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/assets/brand/fennec-a-lockup-primary.svg">
  <img src="public/assets/brand/fennec-a-lockup-navy.svg" alt="Fennec" width="360">
</picture>

[![Web build and deploy](https://github.com/ryanf9802/Fennec/actions/workflows/ci.yml/badge.svg)](https://github.com/ryanf9802/Fennec/actions/workflows/ci.yml)

Fennec is a local-first, second-monitor dashboard for Rocket League's local
Stats API. It records games in the browser, creates automatic sessions, presents
a dedicated live-match monitor, and recognizes recurring teammates and
opponents.

## Run locally in WSL

Install [Node.js 24 or newer](https://nodejs.org/) in WSL, then run:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:5173> in Chrome or Edge. Use `pnpm dev:demo` instead of
`pnpm dev` to exercise a simulated live game without opening Rocket League.

## Rocket League setup

Close Rocket League, find `TAGame\Config\TAStatsAPI.ini` inside the game
installation, and add:

```ini
[TAGame.MatchStatsExporter_TA]
PacketSendRate=2
Port=49123
WebPort=49124
```

Restart Rocket League after saving the file. The in-app Setup center can inspect
and update either supported INI file when the browser is allowed to write it.
Keep the Fennec browser tab or installed PWA open while playing unless the
optional companion is collecting in the background.

## PWA and Windows companion

Chrome and Edge can install Fennec from the browser. The PWA works offline after
its first successful load, checks for updates when it becomes visible or comes
online, and defers a required refresh until a live match has finished.

The optional Tauri companion under `src-tauri` runs in the Windows tray. It
discovers Steam and Epic installations independently, safely backs up and
updates the effective Stats API file (requesting elevation only when needed),
captures while the browser is closed, and synchronizes frames, checkpoints, and
deletions with a paired browser. Its optional per-store Windows desktop
shortcuts launch Rocket League through Steam or Epic, monitor the exact game
executable, and exit the companion when that game process ends unless Windows
startup is enabled.
When startup is enabled, the lightweight collector remains idle in the tray
after the game closes so it is ready for the next session. Settings can register
or remove it from the current user's Windows sign-in startup. An opt-in setting
can also open the dashboard once when Rocket League starts; an installed PWA may
handle that link, with the default browser as the fallback.

The companion checks for signed updates shortly after launch and every hour. It
downloads updates in the background, waits until Rocket League capture has been
idle for 15 seconds, and then installs quietly and restarts. Update failures do
not stop collection and are retried on the next check.

## Local data

Fennec stores versioned match summaries, player appearances, searchable player
relationships, compact semantic events, preferences, and profile selection in
IndexedDB under the current browser origin. Full technical event payloads are
kept for 90 days; compact timelines, player history, touch maps, and analytics
remain available after those payloads expire.

History pages use indexed cursor queries instead of loading the complete
archive into memory. The IndexedDB implementation sits behind a storage-neutral
repository contract, while the paired companion maintains a durable SQLite
journal for browser/companion handoff.

`http://localhost:5173` and `https://app.fennec.gg` have separate storage.
`https://fennec.gg` permanently redirects to the app origin so it cannot create
a second production data store. Use Settings to export a versioned backup from
localhost and restore it on the production origin. Chrome and Edge stream large
backups as NDJSON; JSON fallback and CSV match-summary export are also
available.

## Development

```bash
pnpm install --frozen-lockfile
pnpm playwright:install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm cdk:synth
pnpm test:e2e
```

Windows companion builds additionally require the stable Rust toolchain and the
Tauri Windows prerequisites. Run `pnpm companion:dev` for development or
`pnpm companion:build` for the current-user NSIS installer.

Companion releases are automatic. A companion-related change pushed to `main`
derives a patch version from the GitHub workflow run number, builds and tests the
Windows application, and publishes a `companion-v<version>` GitHub release with
the stable installer, signed NSIS updater archive, and `latest.json`. The
checked-in package major/minor version defines the release train; its patch
component is reserved for CI. No manual tag is needed.

Run `pnpm format` to format repository-owned code, configuration, documentation,
styles, and markup. ESLint also requires explanatory JSDoc on named functions
whose classic cyclomatic complexity exceeds 10. Document the function's purpose,
business rules, invariants, or side effects instead of repeating its TypeScript
types; parameter and return tags are optional.

All Playwright commands use a browser cache under the real `node_modules`
directory. Muxpilot worktrees link that directory from the repository checkout,
so installing Chromium once with `pnpm playwright:install` makes the matching
browser available to every worktree. When the Playwright version changes, rerun
the install command to add its matching Chromium build. Use
`pnpm playwright -- <command>` for other Playwright CLI commands with the same
shared cache.

The direct browser adapter connects to `ws://127.0.0.1:49124` and retries with
bounded exponential backoff. The feed is isolated behind `StatsFeedAdapter` so
a future optional background companion can use the same application model.
While Vite is running, development-only feed telemetry is mirrored to its
terminal with the `[fennec:feed]` prefix. It includes socket lifecycle changes,
sampled packet metadata, event packets, and bounded raw previews for rejected
packets; production builds omit this reporting path.

## AWS deployment

AWS infrastructure is defined in TypeScript CDK and is pinned to personal
account `309418039962`. `FennecSite` creates a private S3 origin, CloudFront
Origin Access Control, SPA routing, security headers, ACM/Route 53 records, and
a permanent `fennec.gg` to `app.fennec.gg` redirect. `FennecCiAccess` creates a
GitHub OIDC role whose trust is restricted to this repository's `main` branch.
The distribution uses AWS-managed caching and dedicated CloudFront Functions so
it remains compatible with CloudFront's flat-rate Free plan.

The deployment intentionally fails before assuming AWS credentials unless
`AWS_ACCOUNT_ID` is exactly `309418039962`. CDK also rejects every other
explicit account ID.

The CI role is pinned to GitHub's immutable owner and repository IDs for
`ryanf9802/Fennec` as well as the `main` ref. If GitHub reports a different OIDC
subject after a repository transfer, set `FENNEC_GITHUB_OIDC_SUBJECT` to the
complete observed `sub` claim when redeploying `FennecCiAccess`.

To establish or recreate deployment access:

1. Configure a personal AWS CLI profile and bootstrap CDK in `us-east-1`.
2. Set `AWS_ACCOUNT_ID` locally and deploy `FennecCiAccess` once:

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

4. Dispatch the workflow on `main` or push to `main`. CI assumes
   `FennecGitHubDeployRole`, deploys `FennecSite`, publishes `dist`, invalidates
   CloudFront, and smoke-tests the URL.
5. In the CloudFront console, subscribe the distribution to the Free flat-rate
   plan and attach the `fennec.gg` hosted zone. Do not enable paid add-ons or
   separately billed logging.
6. Copy the dedicated plan WAF ARN into the `FENNEC_WEB_ACL_ARN` repository
   variable, then dispatch the workflow again. This makes CloudFormation
   declare the plan-managed association so later deployments do not drift.

If the AWS account already has the GitHub Actions OIDC provider, set
`GITHUB_OIDC_PROVIDER_ARN` while deploying `FennecCiAccess` so CDK imports it
instead of creating a duplicate.

### Companion updater signing key

`FennecCiAccess` owns a retained, rotation-enabled KMS key with alias
`alias/fennec-companion-updater`. The main-only GitHub OIDC role can decrypt one
SSM SecureString parameter: `/fennec/companion/updater-signing`. The release
workflow reads that parameter directly; the signing key is not duplicated in
GitHub secrets.

Provision the parameter once after generating the updater key pair. Store JSON
with this shape as a SecureString encrypted by the updater KMS alias:

```bash
pnpm tauri signer generate --write-keys updater.key
```

The command prompts for the private-key password and writes `updater.key` plus
`updater.key.pub`. Put the public-key contents in `src-tauri/tauri.conf.json`.
Base64-encode the complete encrypted `updater.key` file without line wrapping,
then store it and the password using this JSON shape:

```json
{
  "privateKeyBase64": "<base64 of the encrypted Tauri private-key file>",
  "password": "<private-key password>"
}
```

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

Do not replace the Tauri signing key during ordinary maintenance: installed
companions pin its public key and will reject releases signed by another key.
AWS KMS automatic rotation is safe because it re-encrypts the SSM value without
changing the updater signing identity.

## License

Fennec is available under the [MIT License](LICENSE). Third-party components
remain subject to their own licenses; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Rocket League and related names are trademarks of their respective owners.
Fennec is an independent community project and is not endorsed by Psyonix or
Epic Games.
