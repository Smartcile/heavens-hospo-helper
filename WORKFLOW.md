# AGENT WORKFLOW

One issue = one branch = one worktree = one worker session. GitHub is the source of truth.

Everything here is used from the OpenCode Desktop chat. No terminal or CLI is required. The agents run the scripts for you.

Type `/workflow` at any time to show these steps again.

## Defaults

- Integration branch: `develop` (PR base)
- Worktrees: `.worktrees/issue-<number>` inside this repo
- Branches: `issue/<number>-<slug>`
- Worker mode: manual (open the worktree in OpenCode Desktop, select the `implementer` agent)
- Triage: local `/triage`
- Merge: one PR per issue, merged in GitHub web or GitHub Desktop

## Labels

| Label | Meaning |
|---|---|
| `agent:planned` | A triage comment with a fix plan has been posted |
| `agent:approved` | The plan has been reviewed; `/spawn` is allowed |
| `agent:working` | A worktree and branch exist |
| `agent:review` | PR is open and ready for review |
| `agent:blocked` | Waiting on a human decision |
| `agent:merged` | Merged |

## Pipeline

1. `/triage <number>` - read-only investigation and a fix-plan comment on the issue.
2. You review the comment and add `agent:approved`.
3. `/spawn <number>` - creates `.worktrees/issue-<number>`, branch, `.agent/TASK.md`, dependencies.
4. Open the worktree folder in OpenCode Desktop, select `implementer`, and say: `Read .agent/TASK.md and implement it.`
5. `@reviewer review the diff for issue #<number>` - read-only review.
6. You review the diff and run the relevant checks.
7. `/ship <number>` - lint/tests, push branch, open PR to `develop`.
8. Merge one PR at a time in GitHub; rebase the remaining branches on `develop`.

## Plain-text prompts

If you prefer not to use slash commands, paste these into the OpenCode Desktop chat.

| Step | Slash command | Plain text |
|---|---|---|
| Triage | `/triage 21` | `Triage GitHub issue 21. Use the triager role and follow WORKFLOW.md. Post the fix plan as a comment and add agent:planned.` |
| Spawn | `/spawn 21` | `Spawn issue 21 into a worktree using the orchestrator role and scripts/agent/spawn-issue.ps1. Report the branch and folder.` |
| Review | `/review 21` | `Review the current worktree diff for issue 21 using the reviewer role. Read-only. Report blocking, non-blocking, and a verdict.` |
| Ship | `/ship 21` | `Ship issue 21. Run lint and relevant tests, commit, push the issue branch, open a PR to develop, comment on the issue, and add agent:review.` |
| Status | `/status` | `Run scripts/agent/status.ps1 and scripts/agent/merge-check.ps1 and summarize the active work.` |
| Commit setup | none | `Commit and push the workflow setup files to develop.` |
| Merge | none | Use GitHub in the browser or GitHub Desktop. Do not ask an agent to merge. |

## Using OpenCode Desktop

1. Restart OpenCode after adding agents, commands, or config. If a slash command does not appear, use the plain-text prompt instead.
2. Run `/triage 21` in the main project chat, or paste the plain-text version.
3. Read the triage comment on GitHub and add `agent:approved`.
4. Run `/spawn 21`. The agent runs the script; the script creates the worktree, branch, task brief, copies `apps/web/.env.local`, and installs dependencies.
5. In OpenCode Desktop, open `.worktrees/issue-21` as a project. Select the `implementer` agent and say: `Read .agent/TASK.md and implement it.`
6. In that worktree chat, run `@reviewer review the diff for issue #21`.
7. Review the diff yourself. If you need the app running, use a unique port such as `3001`.
8. Run `/ship 21` in the worktree chat.
9. Merge the PR in GitHub web or GitHub Desktop. Merge one PR at a time.

## Rules

- Commit and push this setup to `develop` before the first `/spawn`. The spawn script bases worktrees on `origin/develop` and refuses a dirty checkout.
- Restart OpenCode after adding agents, commands, or config.
- Workers never run `prisma db push`, migrations, seed, Docker, or a shared dev server.
- Schema changes: serialize them, or give that worktree its own `DATABASE_URL`.
- Do not run two issues that touch the same files in parallel.
- Keep 2-3 workers active at most.
- Never auto-merge AI PRs. Human review is the gate.
- Remove the worktree only after the PR is merged.
- To commit or push without a terminal, ask OpenCode in plain text.
- To merge without a terminal, use GitHub in the browser or GitHub Desktop.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/agent/spawn-issue.ps1 -Issue 21` | Create the worktree, branch, task brief, env copy, install |
| `scripts/agent/status.ps1` | Active worktrees, dirty state, ahead/behind, PRs, CI |
| `scripts/agent/merge-check.ps1` | File overlap and merge-order warnings |
