# Fennec development

This guide covers local web development, validation, feed diagnostics, and
Windows companion development. For product setup, use the Setup page inside
Fennec.

## Prerequisites

- Node.js 24 or newer
- Corepack
- Chrome or Edge for the live local Stats API connection
- The stable Rust toolchain and the
  [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/) only
  when developing the companion

The supported local development environment is WSL with `pnpm`.

## Run the web application

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:5173>. Use `pnpm dev:demo` to run a simulated live match
without opening Rocket League.

The direct browser adapter connects to `ws://127.0.0.1:49124` and retries with
bounded exponential backoff. Rocket League must have its WebSocket Stats API
enabled before the game starts. See the in-app Setup center or the
[official Stats API guide](https://www.rocketleague.com/developer/stats-api).

## Architecture

Fennec is a React 19 and TypeScript application built with Vite and Tailwind.
Live packets enter through `StatsFeedAdapter`, are reduced into the domain match
model, and are made available through `FennecContext`. The adapter boundary lets
the direct WebSocket feed and the optional companion use the same application
model.

Durable browser data is accessed through `HistoryRepository`. The current
implementation uses Dexie and IndexedDB for versioned match summaries, compact
events, player appearances, encounter relationships, sessions, preferences,
and raw technical payload retention. History queries are indexed and cursor
paged rather than loading the complete archive into memory.

The browser-only and companion-assisted capture paths are intentionally
independent. The companion collects into a SQLite journal and synchronizes
frames, checkpoints, and deletions with a paired browser.

## Feed diagnostics

While Vite is running, development-only feed telemetry is mirrored to its
terminal with the `[fennec:feed]` prefix. It reports socket lifecycle changes,
sampled packet metadata, event packets, and bounded raw previews for rejected
packets. Production builds omit this reporting path.

The Stats API normally uses TCP port `49123` and WebSocket port `49124`. The
browser application consumes the WebSocket endpoint. Configuration changes do
not take effect until Rocket League is restarted.

## Validation

Run the fast local gate while iterating:

```bash
pnpm check
```

It checks formatting, lint, TypeScript, unit tests, and the production web
bundle. The Husky pre-push hook runs this fast gate for ordinary branch and tag
pushes.

When any pushed ref targets `main`, the hook instead runs the full web gate:

```bash
pnpm check:web
```

That command adds account-neutral CDK synthesis and the complete responsive
Playwright suite. Install the matching Chromium build once before pushing to
`main`; GitHub Web validation runs the same full gate after installing Chromium
on its hosted runner.

Behavior changes should add or update focused automated tests. Bug fixes should
include a regression test that demonstrates the failure when practical. Run
the affected test while iterating, then run the complete fast gate before
publishing.

Run `pnpm format` to format repository-owned code, configuration,
documentation, styles, and markup. ESLint requires explanatory JSDoc on named
functions whose classic cyclomatic complexity exceeds 10. Document the
function's purpose, business rules, invariants, or side effects instead of
restating its TypeScript types.

### Playwright

Install the repository's matching Chromium build once:

```bash
pnpm playwright:install
```

All Playwright commands use a cache under the real `node_modules` directory, so
muxpilot worktrees can share the installed browser revision. Rerun the install
when the Playwright version changes. Use `pnpm playwright -- <command>` for
other Playwright CLI commands through the same launcher and cache.

## Windows companion development

The companion source lives under `src-tauri`. It requires the stable Rust
toolchain and Tauri's Windows build prerequisites.

```bash
pnpm companion:dev
pnpm companion:build
```

`pnpm companion:build` produces an unsigned current-user NSIS installer for
local and pull request validation. Signed updater artifacts are produced only
by the main-branch release workflow, which retrieves the private updater key.
Build the web application before running Rust tests because Tauri's
`frontendDist` points to the generated `dist` directory:

```bash
pnpm build
cd src-tauri
cargo test --locked
```

See the [deployment and release guide](deployment.md) for CI, signed companion
releases, and updater operations.
