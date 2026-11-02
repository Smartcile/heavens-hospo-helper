---
description: Create one worktree and branch for a group of related issues
agent: orchestrator
---
Spawn related issues $ARGUMENTS as one grouped worktree.

If `$ARGUMENTS` is empty, ask for the issue numbers and stop.

Normalize the issue numbers to a comma-separated list before running the script (for example, `12 13 14` becomes `12,13,14`).

Use your bash tool to run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/spawn-issue.ps1 -Issues "12,13,14" -Name "<short wave name>"
```

Before running, confirm:
- every issue has the `agent:approved` label;
- the main checkout is clean;
- the workflow files are committed and pushed to `origin/develop`;
- the issues genuinely share files or a user flow.

After the script:
- report the branch, worktree path, and the included issues;
- tell the user to open the new folder in OpenCode Desktop as a project and select the `implementer` agent.
