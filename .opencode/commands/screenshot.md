---
description: Capture a screenshot on demand and post it to the issue
agent: implementer
---
Capture a screenshot for issue $1 on demand, then post it to the issue.

If `$1` is empty, read `.agent/ISSUES` for the current worktree and ask which issue to use.

1. Read the issue and its triage comment for the screenshot plan: role, path, viewport, and what should be visible.
2. Run this from the current worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/capture-screenshot.ps1 `
  -Issue $1 -Path "/" -Role public -Mobile `
  -StartServer -Worktree (Get-Location).Path -PostComment
```

Use the real values from the screenshot plan:

- `-Role public` for public pages, `admin` or `worker` for authenticated pages.
- `-Path "/admin/team?tab=availability"` for a specific page.
- `-Mobile` for iPhone width (`390x844`), omit for desktop.
- `-Click "button:has-text('ADMIN LOGIN')"` if the screenshot needs a modal open.
- `-WaitFor "text=..."` if the page needs a selector before capture.

For `admin` or `worker` screenshots, `AGENT_SCREENSHOT_EMAIL` and `AGENT_SCREENSHOT_PASSWORD` must be set in `apps/web/.env.local`.

Report the screenshot URL and the issue comment URL. Do not change code.
