---
description: Push a grouped branch and open one PR for review
agent: implementer
---
Ship the grouped worktree.

Read `.agent/ISSUES` for every issue number. Do not guess.

Local checks are the gate. Run `scripts/agent/check.ps1` and do NOT wait for GitHub Actions - pull requests do not run CI. Do not build locally.

1. Commit any remaining changes on the current `wave/<slug>` branch.
2. Confirm the branch is not `develop`, `main`, or `master`.
3. For every issue with the `needs:screenshot` label, capture a screenshot using `scripts/agent/capture-screenshot.ps1` and keep its URL.
4. Push the branch with `git push -u origin HEAD`.
5. Open one PR to `develop` with `gh pr create --base develop`.
   - Put one `Fixes #<number>` line per issue in the body.
   - Include each screenshot URL in the PR body.
6. Run `scripts/agent/check.ps1` in the worktree and record the result. If it fails, fix it, commit, push and re-run. Do not wait for a GitHub check - pull requests do not run CI.
7. Comment on every issue with the PR URL, the local check result, and its screenshot if one was captured.
8. Add the `agent:review` label to every issue.

The image build (`Build and publish image`) starts automatically when the PR is merged and `develop` is pushed. Do not build or publish locally.

Do not merge the PR, force-push, or push to `develop`, `main`, or `master`.
