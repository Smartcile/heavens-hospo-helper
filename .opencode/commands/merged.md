---
description: Close issues after a PR has merged to develop
agent: orchestrator
---
Mark the issues in PR $1 as merged.

If `$1` is empty, ask for the PR number and stop.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/mark-merged.ps1 -Pr $1
```

This is needed because this repo's default branch is `main`, and merges into `develop` do not auto-close `Fixes #...` issues.

Report which issues were closed and their new labels.
