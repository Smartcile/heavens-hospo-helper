# NEXT SESSION — ACTIVATE THE AGENT WORKFLOW

Use this at the start of a new OpenCode Desktop session.

## Copy this into the OpenCode chat

```text
Read WORKFLOW.md and AGENTS.md. We are starting a new agent batch.

Before doing anything, ask me these questions and wait for my answers:
1. Which area or batch do you want to work on? (availability, roster, tasks, guides, orders, events, inventory, SwiftPOS, UI, other)
2. Which issue numbers are in this batch? Run `gh issue list --state open` if I do not know.
3. Should this be one grouped wave or separate branches?
4. Do you want screenshots before merging? Yes, no, or only if I ask later.
5. After CI passes, should you merge and close the issues, or stop at the PR?
6. Is there anything that must not be grouped with the rest?

After I answer:
- Run the grouped triage or single triage.
- Rename the issue titles to `[AREA] Short imperative description`.
- Show me the combined fix plan and wait for my approval before spawning.
- Spawn one grouped wave if I approved a group.
- Use the implementer in the worktree, then the reviewer.
- Capture screenshots only if requested.
- Open the PR, wait for CI, and merge only according to my answer.
- After merging, run `/merged <pr>` to close the issues, because this repo's default branch is `main`, not `develop`.
```

## Questions the agent must ask

| Question | Why |
|---|---|
| Which area/batch? | Keeps unrelated issues out of one wave. |
| Which issue numbers? | The source of truth is GitHub, not memory. |
| Grouped or separate? | Group only 2-4 related issues that share files or a user flow. |
| Screenshots? | Screenshots are opt-in; `needs:screenshot` is the gate. |
| Merge after CI or stop at PR? | Human review is the gate; AI PRs are never auto-merged without permission. |
| Anything not to group? | Prevents a risky or schema-changing issue joining a UI wave. |

## Commands

| Step | Slash command | Plain-text alternative |
|---|---|---|
| Triage one | `/triage 21` | `Triage GitHub issue 21...` |
| Triage a group | `/triage-group 21 15 6` | `Triage issues 21,15,6 as one group...` |
| Spawn one | `/spawn 21` | `Spawn issue 21 into a worktree...` |
| Spawn a wave | `/spawn-group 21 15 6 availability approvals` | `Spawn issues 21,15,6 as one wave...` |
| Review | `/review` | `Review the diff for the issues in .agent/ISSUES...` |
| Screenshot | `/screenshot 21` | `Capture a screenshot for issue 21...` |
| Ship one | `/ship 21` | `Ship issue 21...` |
| Ship a wave | `/ship-group` | `Ship the grouped worktree...` |
| Status | `/status` | `Run the status and merge-check scripts...` |
| After merge | `/merged 24` | `Mark PR 24 merged: close its issues and add agent:merged.` |

## Repo facts to remember

- Integration branch: `develop`. PR base: `develop`.
- GitHub default branch: `main`. Merging into `develop` does **not** auto-close `Fixes #...` issues. Run `/merged <pr>` after each merge.
- Single worktree: `.worktrees/issue-<number>`.
- Grouped worktree: `.worktrees/wave-<slug>`.
- Grouped branch: `wave/<slug>`.
- Group spawn argument format: `-Issues "12,13,14" -Name "short wave name"`.
- The spawn script refuses a dirty main checkout and bases worktrees on `origin/develop`. Commit and push workflow changes before spawning.
- Screenshots need:
  - the local Postgres database running;
  - `AGENT_SCREENSHOT_EMAIL` and `AGENT_SCREENSHOT_PASSWORD` in `apps/web/.env.local`;
  - a page path and role (public/admin/worker) from the triage comment.
- iOS-only CSS cannot be verified by headless Chrome; use a real iPhone screenshot.
- Keep 2-3 workers active at most. Never run two issues that touch the same files in parallel.

## Batch request template

Fill this in before starting:

```text
Batch name:
Area:
Issues:
Grouped or separate:
Screenshot before merge:
Merge after CI or stop at PR:
Anything that must not be grouped:
```
