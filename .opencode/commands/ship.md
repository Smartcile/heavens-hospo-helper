---
description: Run checks, push the branch, and open a PR to develop
agent: implementer
---
Ship issue $1.

1. Run `npm run lint`.
2. Run the relevant tests, then `npm run test` if practical.
3. Commit any remaining changes on the current `issue/<number>-...` branch.
4. Confirm the branch is not `develop`, `main`, or `master`.
5. Push the branch with `git push -u origin HEAD`.
6. Open a PR to `develop` with `gh pr create --base develop`.
7. Comment on the issue with the PR URL and the checks run.
8. Add the `agent:review` label.

Do not merge the PR, force-push, or push to `develop`, `main`, or `master`.
