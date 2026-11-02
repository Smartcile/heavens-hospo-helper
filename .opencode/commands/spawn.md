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
- report the branch, worktree path, and next command;
- tell the user to open the new folder in OpenCode Desktop as a project and select the `implementer` agent.
