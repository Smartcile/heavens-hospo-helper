# AGENT WORKFLOW

One issue = one branch = one worktree = one worker session. Related issues can share one wave. GitHub is the source of truth.

For the copy-paste activation prompt for a new session, see `NEXT-SESSION.md`.

Everything here is used from the OpenCode Desktop chat. No terminal or CLI is required. The agents run the scripts for you.

Type `/workflow` at any time to show these steps again.

## Defaults

- Integration branch: `develop` (PR base)
- Single worktree: `.worktrees/issue-<number>`
- Grouped worktree: `.worktrees/wave-<slug>`
- Single branch: `issue/<number>-<slug>`
- Grouped branch: `wave/<slug>`
- Worker mode: manual (open the worktree in OpenCode Desktop, select the `implementer` agent)
- Merge: one PR per issue or wave, merged one at a time
- Screenshots: only when requested, using the `needs:screenshot` label

## Parallel lanes (default)

Work runs in independent lanes. A lane is an ordered list of issues; a lane runs one issue at a time. Two lanes may run at the same time because they do not touch the same files.

| Lane | Typical order | Shared surface |
|---|---|---|
| Inventory / menus | `#73` (parked) → `#88` → `#89` | `AdminNav`, `lib/hub-tabs`, `RecipesClient`, `MenusClient` |
| Tasks | `#86` → `#87` | `WorkerTasksClient`, task routes |

Rules:
- One worktree per lane (`.worktrees/issue-<number>`). Worktrees are separate copies: separate files, `node_modules` and `.next`; they share the git object store. Do not create a second full clone.
- Two implementers maximum (one per lane). Never run two issues in the same lane at once.
- Before starting a second lane, run `scripts/agent/merge-check.ps1` and confirm there is no file overlap.
- Merge one PR at a time. When the lead issue merges, rebase the next issue in that lane onto `origin/develop` before spawning it.
- Group issues only within a lane, never across lanes.

## Local checks and manual CI

GitHub Actions is **manual-only** (`workflow_dispatch`) plus `v*` release tags. A normal push or PR starts no cloud run.

Before pushing or shipping:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/check.ps1
```

That runs Prisma generate, lint, type-check and the full test suite locally. Add `-Build` to compile the app (it restores `apps/web/version.json`), `-Install` to reinstall, or `-SkipTest` / `-SkipTypeCheck` for a quick pass.

To publish the production image:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/publish.ps1 -Tag develop
```

That runs the checks, builds `apps/web/Dockerfile` and pushes to GHCR. Portainer keeps pulling the image.

Fallback: open **Actions → CI** or **Build and publish image → Run workflow** and pick a branch to request a cloud run.

## Issue titles

Every triaged issue gets a clean title:

```text
[AREA] Short imperative description
```

Areas: `[AVAILABILITY]`, `[ROSTER]`, `[TASKS]`, `[GUIDES]`, `[BOOKINGS]`, `[ORDERS]`, `[INVENTORY]`, `[EVENTS]`, `[SWIFTPOS]`, `[UI]`, `[OTHER]`.

Keep it under 72 characters, sentence case, no full stop. For a group, every issue uses the same area prefix.

## Labels

| Label | Meaning |
|---|---|
| `agent:planned` | A triage comment with a fix plan has been posted |
| `agent:approved` | The plan has been reviewed; spawn is allowed |
| `agent:working` | A worktree and branch exist |
| `agent:review` | PR is open and ready for review |
| `agent:blocked` | Waiting on a human decision |
| `agent:merged` | Merged |
| `needs:screenshot` | Capture and post a screenshot before approving the merge |

## Single-issue pipeline

1. `/triage <number>` - read-only investigation, title cleanup, and a fix-plan comment.
2. You review the comment and add `agent:approved`.
3. `/spawn <number>` - creates the worktree, branch, `.agent/TASK.md`, dependencies.
4. Open the worktree in OpenCode Desktop, select `implementer`, and say: `Read .agent/TASK.md and implement it.`
5. `@reviewer review the diff for the issues in .agent/ISSUES` - read-only review.
6. If you want a visual check, run `/screenshot <number>` before approving the merge.
7. You review the diff and run the relevant checks.
8. `/ship <number>` - run the local checks (`scripts/agent/check.ps1`), push, PR, issue update, screenshot if requested. Cloud CI is manual-only; do not wait for it.
9. Merge one PR at a time in GitHub. Then run `/merged <pr>` to close the issue(s), because this repo's default branch is `main`, not `develop`.

## Grouped pipeline

Use this for 2-4 related issues that share files or a user flow. Do not group unrelated areas.

1. `/triage-group 12 13 14` - one combined plan, every title cleaned up, each issue labelled `agent:planned`.
2. You review the plan and add `agent:approved` to every issue.
3. `/spawn-group 12 13 14 availability approvals` - one worktree and branch for the group. Pass the issue numbers as a comma-separated list to the script (`-Issues "12,13,14"`).
4. Open the worktree in OpenCode Desktop, select `implementer`, and say: `Read .agent/TASK.md and implement it.`
5. `@reviewer review the diff for the issues in .agent/ISSUES`.
6. Run `/screenshot <lead-issue>` if you want a visual check.
7. `/ship-group` - run the local checks (`scripts/agent/check.ps1`), then one PR with `Fixes #12`, `Fixes #13`, `Fixes #14`. Cloud CI is manual-only; do not wait for it.
8. Merge the wave PR once, then run `/merged <pr>` to close every issue in the PR.

## Screenshots on request

Screenshots are optional. The agent only captures one when you ask, or when an issue has `needs:screenshot`.

```text
/screenshot 11
```

The agent:

1. starts the app in the worktree on a unique port;
2. opens it in headless Chrome or Edge;
3. captures the page at the requested viewport;
4. publishes the image to the `agent-screenshots` branch;
5. posts it as a comment on the issue.

For authenticated pages, set `AGENT_SCREENSHOT_EMAIL` and `AGENT_SCREENSHOT_PASSWORD` in `apps/web/.env.local`.

Authenticated screenshots also need the local Postgres database running. If the database is down, the login step fails before the screenshot is captured; do not merge the screenshot gate silently — record the blocker or run `/screenshot` again once the database is up.

Limits:
- Headless Chrome cannot reproduce iOS Safari's focus zoom. For iOS-only CSS, take a real iPhone screenshot manually.
- A screenshot is a visual aid, not a substitute for testing.

## Plain-text prompts

If a slash command does not appear, paste these into the OpenCode Desktop chat.

| Step | Slash command | Plain text |
|---|---|---|
| Triage | `/triage 21` | `Triage GitHub issue 21. Use the triager role and follow WORKFLOW.md. Rename the title, post the fix plan, and add agent:planned.` |
| Group triage | `/triage-group 12 13 14` | `Triage GitHub issues 12, 13, 14 as one group. Use the triager role. Rename each title, post one combined plan, and add agent:planned to each.` |
| Spawn | `/spawn 21` | `Spawn issue 21 into a worktree using the orchestrator role and scripts/agent/spawn-issue.ps1. Report the branch and folder.` |
| Group spawn | `/spawn-group 12 13 14` | `Spawn issues 12,13,14 as one wave using scripts/agent/spawn-issue.ps1 -Issues 12,13,14 -Name "availability approvals". Report the branch and folder.` |
| Review | `/review` | `Review the current worktree diff using the reviewer role. Read .agent/ISSUES. Read-only. Report blocking, non-blocking, and a verdict.` |
| Screenshot | `/screenshot 11` | `Capture a screenshot for issue 11 and post it to the issue. Use the screenshot plan from the triage comment.` |
| Ship | `/ship 21` | `Ship issue 21. Read .agent/ISSUES, run scripts/agent/check.ps1, capture a screenshot only if needs:screenshot is set, push, open a PR to develop, comment on the issue, add agent:review. Cloud CI is manual-only; do not wait for it.` |
| Group ship | `/ship-group` | `Ship the grouped worktree. Read .agent/ISSUES, run scripts/agent/check.ps1, capture screenshots only for issues with needs:screenshot, push, open one PR with Fixes lines, and comment on every issue. Cloud CI is manual-only; do not wait for it.` |
| Status | `/status` | `Run scripts/agent/status.ps1 and scripts/agent/merge-check.ps1 and summarize the active work.` |
| Merged | `/merged 22` | `Mark PR 22 as merged: close its issues and add agent:merged.` |
| Commit setup | none | `Commit and push the workflow setup files to develop.` |
| Merge | none | Use GitHub in the browser or GitHub Desktop. Do not ask an agent to merge. |

## Using OpenCode Desktop

1. Restart OpenCode after adding agents, commands, or config. If a slash command does not appear, use the plain-text prompt instead.
2. Run `/triage 21` in the main project chat, or paste the plain-text version.
3. Read the triage comment on GitHub and add `agent:approved`.
4. Run `/spawn 21`. The agent runs the script; the script creates the worktree, branch, task brief, copies `apps/web/.env.local`, and installs dependencies.
5. In OpenCode Desktop, open the new worktree as a project. Select the `implementer` agent and say: `Read .agent/TASK.md and implement it.`
6. In that worktree chat, run `@reviewer review the diff for the issues in .agent/ISSUES`.
7. Review the diff yourself. If you need the app running, use a unique port such as `3001`.
8. Run `/screenshot <issue>` if you want a visual update before merging.
9. Run `/ship <issue>` (or `/ship-group`) in the worktree chat.
10. Merge the PR in GitHub web or GitHub Desktop. Merge one PR at a time.
11. Run `/merged <pr>` after the merge. This closes the issue(s) and adds `agent:merged`; GitHub does not auto-close them when the PR targets `develop` because the repo's default branch is `main`.

## Rules

- Commit and push this setup to `develop` before the first spawn. The spawn script bases worktrees on `origin/develop` and refuses a dirty checkout.
- Restart OpenCode after adding agents, commands, or config.
- Workers never run `prisma db push`, migrations, seed, Docker, or a shared dev server.
- Schema changes: serialize them, or give that worktree its own `DATABASE_URL`.
- Use the two-lane default: two implementers maximum, one issue per lane, `merge-check.ps1` before the second lane.
- Do not run two issues that touch the same files in parallel.
- Group only 2-4 related issues within a lane. Do not group unrelated areas just to reduce branches.
- Run `scripts/agent/check.ps1` before pushing. Cloud CI is manual-only; request a run from Actions only when needed.
- Never auto-merge AI PRs. Human review is the gate.
- Remove the worktree only after the PR is merged.
- To commit or push without a terminal, ask OpenCode in plain text.
- To merge without a terminal, use GitHub in the browser or GitHub Desktop.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/agent/spawn-issue.ps1 -Issue 21` | Create a single-issue worktree |
| `scripts/agent/spawn-issue.ps1 -Issues 12,13,14 -Name "availability approvals"` | Create a grouped wave worktree |
| `scripts/agent/check.ps1` | Local gate: Prisma, lint, type-check, tests (`-Build` to compile) |
| `scripts/agent/publish.ps1 -Tag develop` | Local gate + Docker build + GHCR push |
| `scripts/agent/status.ps1` | Active worktrees, dirty state, ahead/behind, PRs, CI |
| `scripts/agent/merge-check.ps1` | File overlap and merge-order warnings |
| `scripts/agent/mark-merged.ps1 -Pr 22` | Close the issues linked from a merged PR |
| `scripts/agent/capture-screenshot.ps1` | Capture and publish a screenshot on request |
