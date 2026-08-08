---
name: fennec-browser-testing
description: Test and debug Fennec in Chromium through its shared Playwright launcher. Use when Codex needs to validate Fennec UI or browser behavior, responsive layout, navigation, the demo feed, IndexedDB-backed flows, screenshots, traces, or Playwright E2E coverage, or when a Fennec checkout or muxpilot worktree is missing its matching Chromium revision.
---

# Fennec Browser Testing

Use the repository launcher for every Playwright command. It resolves the real
`node_modules` directory, so muxpilot worktrees share the browser cache.

## Workflow

1. Run commands from the Git root. Prefer `./scripts/playwright.mjs`; do not call
   `playwright`, `npx playwright`, or `pnpm exec playwright` directly.
2. Inspect `playwright.config.ts` and the relevant files in `tests/e2e/` before
   choosing coverage.
3. Use `?demo=1` for app flows. Do not require a running Rocket League client or
   its local Stats API for browser validation.
4. Run the smallest relevant test or `--grep` selection with one worker. The
   Playwright config starts and stops the Vite demo server automatically.
5. Add or update a durable E2E test when the changed behavior needs regression
   coverage. Prefer role or label locators and observable assertions over fixed
   delays.
6. Inspect screenshots, error context, or retained traces when a result needs
   visual diagnosis. Keep intentional regression artifacts; remove temporary
   diagnostic specs and screenshots before committing.

## Commands

Check the repository Playwright version:

```bash
./scripts/playwright.mjs --version
```

Run one test by title:

```bash
./scripts/playwright.mjs test tests/e2e/responsive.spec.ts \
  --grep 'primary pages use the same full content width' --workers=1
```

Run one E2E file:

```bash
./scripts/playwright.mjs test tests/e2e/responsive.spec.ts --workers=1
```

Run the complete E2E suite only when the requested scope justifies a
repository-wide browser check. Under muxpilot, route it through the active
heavyweight-command workflow.

## Browser Installation

If launch fails because the locked browser executable is absent, install the
matching Chromium build once:

```bash
./scripts/playwright.mjs install chromium
```

The shared cache is under the real `node_modules/.cache/ms-playwright`, not the
individual worktree. Rerun installation after the Playwright lockfile version
changes or after shared dependencies are recreated. Under muxpilot, always
route browser installation through the active heavyweight-command workflow.

Do not reinstall npm dependencies merely because Chromium is missing. If
`node_modules` itself is unavailable, follow the active repository dependency
workflow before running Playwright.

## Artifacts and Read-Only Checks

The config retains traces on failure. Open one through the launcher:

```bash
./scripts/playwright.mjs show-trace <trace.zip>
```

When inspecting the read-only target checkout, pass an explicit writable output
directory such as `--output=/tmp/fennec-playwright-check`. In an implementation
worktree, the default `test-results/` path is safe and ignored by Git.

For visual checks, capture a focused `page.screenshot()` from a Playwright test
and inspect the resulting image. Store disposable screenshots under `/tmp` and
commit screenshots only when they are deliberate test fixtures or baselines.
