# Fennec repository guidance

## Required workflow

- Use `$fennec-change-validation` for every implementation, bug fix, refactor,
  CI repair, or integration-preparation task in this repository.
- Inspect the affected implementation, its callers, and existing coverage
  before editing. Shared routing, context, persistence, and workflow contracts
  require checking existing consumers, not only adding a new test.
- Add or update focused automated tests for behavior changes. Every bug fix must
  include a regression test that fails without the fix when practical.
- Run the affected test file or case while iterating. Focused success supports
  iteration; it never replaces the final repository gate.

## Definition of done

- Run the validation skill's `full` command from the final tree before
  publishing a branch or declaring repository changes complete. It invokes the
  same `check` package script as the `pnpm check` pre-push hook, using npm so the
  command also works in managed linked worktrees where pnpm cannot open its
  database.
- Treat a nonzero exit, failed or skipped required stage, React `act(...)`
  message, unhandled error, or other unexpected stderr as unfinished work.
  Diagnose and remove the cause; do not dismiss output because tests passed.
- Any material edit, conflict resolution, rebase, or integration reconciliation
  invalidates earlier affected checks. Rerun them before completion.
- Self-review the complete final diff and fix every actionable finding. Report
  the exact validation commands and outcomes. If a required check cannot run,
  state that limitation and do not imply it passed.

## Change-specific proof

- Run focused Playwright coverage for browser-visible behavior through
  `$fennec-browser-testing`, using the shared launcher, a fresh port, and one
  worker. Add durable E2E coverage when unit tests cannot prove the behavior.
- For infrastructure or deployment changes, run the focused workflow/stack
  tests and account-neutral CDK synthesis in addition to the final gate.
- For companion changes, build the web application before `cargo test --locked`.
  Treat a successful `windows-latest` job as the authority for Windows-only
  linking, packaging, and installer behavior.

## Change quality

- Preserve raw telemetry and domain meaning; do not replace unavailable values
  with invented defaults.
- Keep changes focused, document non-obvious invariants, and update this file or
  the validation skill whenever required commands or completion rules change.
