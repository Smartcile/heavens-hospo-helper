---
description: Create a worktree and branch for an approved issue
agent: orchestrator
---
Spawn issue $1 into its own worktree.

If `$1` is empty, ask for the issue number and stop.

Use your bash tool to run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/spawn-issue.ps1 -Issue $1
```

Before running, confirm:
- the issue has the `agent:approved` label;
- the main checkout is clean;
- the workflow files are committed and pushed to `origin/develop`.

After the script:
- report the branch and worktree path;
- if I asked you to continue, delegate implementation to the `implementer` subagent with the absolute worktree path and `.agent/TASK.md`; otherwise stop and report the next step.