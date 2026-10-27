# GITHUB ISSUES — SESSION PLAN

Source of truth: GitHub issues (`gh issue list --state open`).
Last synced: 2026-10-27.
Session status: all implementation PRs are open against `develop`; CI pending;
nothing merged. Human review is the gate.

This doc records the grouping decisions for the current session. GitHub remains
authoritative; update this file when issues are closed or regrouped.

## Session status (2026-10-27)

| PR | Branch | Issues | Status |
|---|---|---|---|
| [#25](https://github.com/Smartcile/heavens-hospo-helper/pull/25) | `wave/availability-locking-and-ux` | #12, #14, #20, #13, #7, #16 | PR open, CI pending |
| [#26](https://github.com/Smartcile/heavens-hospo-helper/pull/26) | `wave/tasks-authoring` | #8, #19, #4 | PR open, CI pending |
| [#27](https://github.com/Smartcile/heavens-hospo-helper/pull/27) | `issue/18-guides-annotations` | #18 | PR open, CI pending |
| [#28](https://github.com/Smartcile/heavens-hospo-helper/pull/28) | `issue/5-swiftpos` | #5 | PR open, CI pending; live SwiftDOSnet smoke test blocked (unreachable) |
| [#29](https://github.com/Smartcile/heavens-hospo-helper/pull/29) | `issue/9-phone-session` | #9 | PR open, CI pending |
| [#30](https://github.com/Smartcile/heavens-hospo-helper/pull/30) | `issue/17-section-worked` | #17 | PR open, CI pending |

Verified and closed: **#3** (roster drag-fill / series verification).


## Decisions (approved 2026-10-27)

| Topic | Decision |
|---|---|
| Availability locking (#12/#14) | Day-level lock. Worker edits/overwrites blocked until a manager/admin unlocks. Notes stay editable. Approving availability auto-locks that day. |
| Worker series edits (#20) | Edit detaches only the clicked day into a standalone row. Later series days and already-approved days are never overwritten. |
| Bulk clear (#13) | Desktop: shift-click first/last day. Mobile: SELECT MODE toggle, tap days, CLEAR with confirmation. |
| No-refresh/scroll (#16) | Preserve scroll/expanded state on live pages (availability, roster, tasks) without a full SPA rewrite. |
| Worker task/list editing (#8) | Authorised workers get the same task and checklist settings as admin, permission-gated, including adding a task directly to a list. |
| Section worked (#17) | Completion flags the person for review; a manager must confirm before the section is granted. |
| Phone session (#9) | Stay logged in while active. A venue setting controls the inactivity timeout that requires re-auth. |
| SwiftPOS (#5) | All three parts: verify staff sync, menu linking page, kitchen dockets page. |
| Already-built (#3/#4) | Verify against code and tests, post evidence, close only the parts genuinely in place; keep gaps open. |
| Process | Commit/push workflow setup first. Open PRs and stop for user review; never auto-merge. |

## Waves and singles

### Wave A — `wave/availability-locking` (#12, #14, #20)
Locking and series safety. Same availability files, so this wave runs before
Wave B.

### Wave B — `wave/availability-ux` (#13, #7, #16)
Bulk clear, worker default weekly view, no-refresh/scroll preservation. Touches
availability UI, so it runs after Wave A.

### Wave C — `wave/tasks-authoring` (#8, #19)
Direct add-to-list and the stale left-hand available-task list.

### Singles
| Branch | Issue | Area |
|---|---|---|
| `issue/18-guides-annotations` | #18 — worker annotations not showing | GUIDES |
| `issue/17-section-worked` | #17 — manager-confirmed section completion | TRAINING |
| `issue/9-phone-session` | #9 — stay logged in + configurable timer | UI |
| `issue/5-swiftpos` | #5 — staff sync verify, menu linking, kitchen dockets | SWIFTPOS |

### Verification only (no worktree unless gaps found)
- #3 — roster drag/drop admin-only, confirmation, series prompt.
- #4 — task outcomes, worker chrome, back-button guard.

## Open issue inventory

| # | Title | Type |
|---|---|---|
| 20 | Approvals — worker series edit limits | bug |
| 19 | Tasks — dragged task stays in available list | bug |
| 18 | Guides — worker annotations missing | bug |
| 17 | Training/Sections — confirm worked-in-section | bug |
| 16 | Availability — no refresh/scroll loss (global) | bug |
| 14 | Availability — lock shifts | feature |
| 13 | Availability — bulk clear | feature |
| 12 | Availability — manual lock + auto-lock on approval | feature |
| 9 | App on Phone — session timeout | bug |
| 8 | Edit Mode — add task to list, expose settings | bug |
| 7 | Navigation — worker availability weekly default | feature |
| 5 | SwiftDOSNet — sync, menu linking, kitchen dockets | feature |
| 4 | Tasks & Lists — outcomes + chrome | bug + feature |
| 3 | Staff Rosters — admin-only drag/drop + confirmation | bug + feature |
