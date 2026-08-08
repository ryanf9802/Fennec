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

Restart Rocket League after saving the file. Keep the Fennec browser tab open
while playing. Fennec cannot edit protected game files or continue recording
after the tab closes.

## Local data

Fennec stores versioned match summaries, player appearances, searchable player
relationships, compact semantic events, preferences, and profile selection in
IndexedDB under the current browser origin. Full technical event payloads are
kept for 90 days; compact timelines, player history, touch maps, and analytics
remain available after those payloads expire.

History pages use indexed cursor queries instead of loading the complete
archive into memory. The IndexedDB implementation sits behind a storage-neutral
repository contract so a future optional companion or remote service can use
the same domain records and query behavior without changing the UI.

`http://localhost:5173` and `https://app.fennec.gg` have separate storage. Use
Settings to export a versioned backup from one origin and restore it on the
other. Chrome and Edge stream large backups as NDJSON; JSON fallback and CSV
match-summary export are also available.

## Development

```bash
pnpm install --frozen-lockfile
pnpm playwright:install
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm cdk:synth
pnpm test:e2e
```

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

AWS infrastructure is defined in TypeScript CDK and remains account-neutral
until deployment variables are supplied. `FennecSite` creates a private S3
origin, CloudFront Origin Access Control, SPA routing, security headers, and
optional ACM/Route 53 records. `FennecCiAccess` creates a GitHub OIDC role whose
trust is restricted to this repository's `main` branch.

The `main` deployment intentionally fails before touching AWS when the GitHub
repository variable `AWS_ACCOUNT_ID` is absent. Do not configure it with a work
account.

When the personal AWS account and `fennec.gg` are ready:

1. Configure a personal AWS CLI profile and bootstrap CDK in `us-east-1`.
2. Set `AWS_ACCOUNT_ID` locally and deploy `FennecCiAccess` once:

   ```bash
   AWS_ACCOUNT_ID=123456789012 AWS_REGION=us-east-1 \
     pnpm cdk deploy FennecCiAccess --profile your-personal-profile
   ```

3. Add these GitHub repository variables:

   | Variable | Value |
   | --- | --- |
   | `AWS_ACCOUNT_ID` | Personal 12-digit AWS account ID |
   | `AWS_REGION` | `us-east-1` |
   | `FENNEC_APP_DOMAIN` | `app.fennec.gg` |
   | `FENNEC_ZONE_NAME` | `fennec.gg` |
   | `FENNEC_HOSTED_ZONE_ID` | Route 53 public hosted-zone ID |

4. Rerun the failed workflow or push to `main`. CI assumes
   `FennecGitHubDeployRole`, deploys `FennecSite`, publishes `dist`, invalidates
   CloudFront, and smoke-tests the URL.
5. Subscribe the distribution to CloudFront's Free flat-rate plan in the AWS
   console if pricing-plan subscription is still unavailable through CDK.

If the AWS account already has the GitHub Actions OIDC provider, set
`GITHUB_OIDC_PROVIDER_ARN` while deploying `FennecCiAccess` so CDK imports it
instead of creating a duplicate.

## License

Fennec is available under the [MIT License](LICENSE). Third-party components
remain subject to their own licenses; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Rocket League and related names are trademarks of their respective owners.
Fennec is an independent community project and is not endorsed by Psyonix or
Epic Games.
