---
description: Run checks, push the branch, open a PR, and optionally post a screenshot
agent: implementer
---
Ship issue $1.

Read `.agent/ISSUES` first. If it exists, use every issue number in it; otherwise use `$1`.

1. Run `npm run lint`.
2. Run the relevant tests, then `npm run test` if practical.
3. Commit any remaining changes on the current `issue/<number>-...` or `wave/<slug>` branch.
4. Confirm the branch is not `develop`, `main`, or `master`.
5. If any issue has the `needs:screenshot` label, capture one screenshot using `scripts/agent/capture-screenshot.ps1` and keep its URL. If no issue has that label, skip the screenshot.
6. Push the branch with `git push -u origin HEAD`.
7. Open a PR to `develop` with `gh pr create --base develop`.
   - Put one `Fixes #<number>` line per issue in the body.
   - Include the screenshot URL in the PR body if one was captured.
8. Comment on every issue with the PR URL, the checks run, and the screenshot image if one was captured.
9. Add the `agent:review` label to every issue.

Do not merge the PR, force-push, or push to `develop`, `main`, or `master`.
