---
name: fennec-change-validation
description: Validate Fennec implementations, bug fixes, refactors, CI repairs, and integration candidates with focused tests, the complete local gate, and change-specific infrastructure or companion checks. Use for every repository change before Codex declares it complete, prepares integration, commits for handoff, or publishes a branch.
---

# Fennec Change Validation

Use the bundled runner to make validation repeatable. Read the root `AGENTS.md`
first; its completion contract remains authoritative.

## Workflow

1. Inspect the affected implementation, callers, existing tests, and final diff.
2. Add regression coverage, then iterate with the smallest relevant test files:

   ```bash
   node .agents/skills/fennec-change-validation/scripts/validate.mjs focused \
     --test tests/example.test.tsx
   ```

3. Use `$fennec-browser-testing` for browser-visible behavior. Add `--infra` for
   CDK/deployment work or `--companion` for native companion work.
4. From the final tree, run the complete gate:

   ```bash
   node .agents/skills/fennec-change-validation/scripts/validate.mjs full
   ```

5. Treat unexpected stderr, including React `act(...)` messages and unhandled
   errors, as a failure even when the command exits zero. Fix the cause.
6. Self-review the complete diff. After any material change or reconciliation,
   rerun the affected focused checks and the full gate.
7. Report exact commands and outcomes. Never claim an unrun check passed.

## Runner options

- Repeat `--test <path>` in `focused` mode to select test files. Tests run with
  one worker for deterministic iteration.
- Add `--infra` to run account-neutral CDK synthesis after the selected gate.
- Add `--companion` to build the web application and run locked Rust tests.
- Add `--dry-run` to print commands without executing them.
- Run full, infrastructure, companion, and complete browser checks through any
  heavyweight-command scheduler required by the active agent environment.

The companion stage cannot prove Windows linking or installer behavior. Require
the repository's `windows-latest` check before publishing companion changes.
