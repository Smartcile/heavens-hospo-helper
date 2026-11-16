---
description: Show active issue worktrees and PR status
agent: orchestrator
---
Show the current agent work status.

Use your bash tool to run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/status.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/merge-check.ps1
```

Summarize:
- active worktrees and branches;
- dirty worktrees;
- ahead/behind `develop`;
- open PRs and last check state;
- file overlaps that affect merge order.
