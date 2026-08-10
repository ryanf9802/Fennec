# Fennec repository guidance

## Development workflow

- Add or update focused automated tests for behavior changes. Every bug fix must
  include a regression test that fails without the fix when practical.
- Run the affected test file or case while iterating. Do not substitute a broad
  test run for understanding the behavior under change.
- Run `pnpm check` before publishing a branch or declaring repository changes
  complete. The pre-push hook runs the same fast validation gate automatically.
  In a managed linked worktree where pnpm cannot open its database, run the
  identical package script with `npm run check`.
- Run focused Playwright coverage for browser behavior and follow
  `docs/development.md` for the shared launcher and unique-port workflow.
- For companion changes, build the web application before Rust tests. Treat a
  successful `windows-latest` job as the authority for Windows-only linking and
  installer behavior.

## Change quality

- Preserve raw telemetry and domain meaning; do not replace unavailable values
  with invented defaults.
- Keep changes focused, document non-obvious invariants, and update contributor
  guidance when build or validation requirements change.
