---
description: Push a grouped branch, open one PR, and wait for GitHub Actions
agent: implementer
---
Ship the grouped worktree.

Read `.agent/ISSUES` for every issue number. Do not guess.

GitHub Actions is the gate. Do NOT run `scripts/agent/check.ps1` and do NOT build locally.

1. Commit any remaining changes on the current `wave/<slug>` branch.
2. Confirm the branch is not `develop`, `main`, or `master`.
3. For every issue with the `needs:screenshot` label, capture a screenshot using `scripts/agent/capture-screenshot.ps1` and keep its URL.
4. Push the branch with `git push -u origin HEAD`.
5. Open one PR to `develop` with `gh pr create --base develop`.
   - Put one `Fixes #<number>` line per issue in the body.
   - Include each screenshot URL in the PR body.
6. Wait for the `CI` workflow on the PR with `gh pr checks --watch`. It runs lint, type-check, tests and the Next.js build.
   - If any check fails, read the failing step, fix it, commit, push, and watch again. Never merge with a red check.
   - Record the run URL (from `gh pr checks` or `gh run list --branch "$(git branch --show-current)" --limit 1`).
7. Comment on every issue with the PR URL, the GitHub Actions result + run URL, and its screenshot if one was captured.
8. Add the `agent:review` label to every issue.

The image build (`Build and publish image`) starts automatically when the PR is merged and `develop` is pushed. Do not build or publish locally.

Do not merge the PR, force-push, or push to `develop`, `main`, or `master`.
