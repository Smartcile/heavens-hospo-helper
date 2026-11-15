---
description: Push the branch and open a PR to develop for review
agent: implementer
---
Ship issue $1.

Read `.agent/ISSUES` first. If it exists, use every issue number in it; otherwise use `$1`.

Local checks are the gate. Run `scripts/agent/check.ps1` and do NOT wait for GitHub Actions - pull requests do not run CI. Do not build locally.

1. Commit any remaining changes on the current `issue/<number>-...` or `wave/<slug>` branch.
2. Confirm the branch is not `develop`, `main`, or `master`.
3. If any issue has the `needs:screenshot` label, capture one screenshot using `scripts/agent/capture-screenshot.ps1` and keep its URL. If no issue has that label, skip the screenshot.
4. Push the branch with `git push -u origin HEAD`.
5. Open a PR to `develop` with `gh pr create --base develop`.
   - Put one `Fixes #<number>` line per issue in the body.
   - Include the screenshot URL in the PR body if one was captured.
6. Run `scripts/agent/check.ps1` in the worktree and record the result. If it fails, fix it, commit, push and re-run. Do not wait for a GitHub check - pull requests do not run CI.
7. Comment on every issue with the PR URL, the local check result, and the screenshot image if one was captured.
8. Add the `agent:review` label to every issue.

The image build (`Build and publish image`) starts automatically when the PR is merged and `develop` is pushed. Do not build or publish locally.

Do not merge the PR, force-push, or push to `develop`, `main`, or `master`.
