---
description: Run checks, push a grouped branch, open one PR, and optionally post screenshots
agent: implementer
---
Ship the grouped worktree.

Read `.agent/ISSUES` for every issue number. Do not guess.

1. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/check.ps1`.
2. If it fails, fix the failure and re-run. Do not push with failing checks.
3. Commit any remaining changes on the current `wave/<slug>` branch.
4. Confirm the branch is not `develop`, `main`, or `master`.
5. For every issue with the `needs:screenshot` label, capture a screenshot and keep its URL.
6. Push the branch with `git push -u origin HEAD`.
7. Open one PR to `develop` with `gh pr create --base develop`.
   - Put one `Fixes #<number>` line per issue in the body.
   - Include the `scripts/agent/check.ps1` result (pass/fail + test count) in the body.
   - Include each screenshot URL in the PR body.
8. Comment on every issue with the PR URL, the checks run, and its screenshot if one was captured.
9. Add the `agent:review` label to every issue.

Cloud CI is manual-only in this repo (`workflow_dispatch`). Do not wait for it. Only request a run from Actions when the user asks.

Do not merge the PR, force-push, or push to `develop`, `main`, or `master`.
