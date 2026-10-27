# GITHUB ISSUES — SESSION PLAN

Source of truth: GitHub issues (`gh issue list --state open`).
Last synced: 2026-10-27.
Session status: all six implementation PRs are merged into `develop` (head
`d0fd1f6`). Combined develop verification passed locally: lint 0 errors, 225
test files / 2,057 tests. Issues closed after merge; **#5 remains open and
blocked** on the live SwiftDOSnet smoke test.

This doc records the grouping decisions for the current session. GitHub remains
authoritative; update this file when issues are closed or regrouped.

## Session status (2026-10-27)

| PR | Branch | Issues | Status |
|---|---|---|---|
| [#25](https://github.com/Smartcile/heavens-hospo-helper/pull/25) | `wave/availability-locking-and-ux` | #12, #14, #20, #13, #7, #16 | Merged; all six issues closed |
| [#26](https://github.com/Smartcile/heavens-hospo-helper/pull/26) | `wave/tasks-authoring` | #8, #19, #4 | Merged; all three issues closed |
| [#27](https://github.com/Smartcile/heavens-hospo-helper/pull/27) | `issue/18-guides-annotations` | #18 | Merged; issue closed |
| [#28](https://github.com/Smartcile/heavens-hospo-helper/pull/28) | `issue/5-swiftpos` | #5 | Merged; issue **open/blocked** on live SwiftDOSnet smoke test |
| [#29](https://github.com/Smartcile/heavens-hospo-helper/pull/29) | `issue/9-phone-session` | #9 | Merged; issue closed |
| [#30](https://github.com/Smartcile/heavens-hospo-helper/pull/30) | `issue/17-section-worked` | #17 | Merged; issue closed |

Also verified and closed: **#3** (roster drag-fill / series verification).

### Known blockers / follow-ups

- **#5 SwiftPOS:** SwiftDOSnet is unreachable from this environment, so the
  product/lookups/kitchen-docket calls are verified with fixtures and mocked
  fetch only. Live smoke testing needs a reachable SwiftDOSnet URL and a venue
  row pointed at it. Test Settings → SWIFT POS → STAFF SYNC / MENU LINKS and
  Ops → Orders → DOCKETS, then close #5.
- **#9 phone session:** existing deployments with a custom
  `WORKER_SESSION_EXPIRY_MINUTES` default to 15 until a venue saves `0`/blank to
  use the env fallback.
- No screenshots were captured (none of the issues carry `needs:screenshot`).
- Worktrees were created per wave/issue; remove each after its PR is merged.

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
| Already-built (#3/#4) | Verify against code and tests, post evidence, close only the parts genuinely in place; keep gaps open. #3 verified/closed; #4 gaps fixed in PR #26. |
| Process | Commit/push workflow setup first. Open PRs, review, then merge one at a time. |

## Waves and singles (as executed)

### Wave A+B — `wave/availability-locking-and-ux` (PR #25)
Combined because both plans touch the same availability files. Covers locking
(#12/#14), safe series edits (#20), bulk clear (#13), weekly default (#7) and
in-place refresh/scroll preservation (#16).

### Wave C — `wave/tasks-authoring` (PR #26)
Worker authoring (#8), the stale available-task list (#19), and the verified
gaps from #4.

### Singles
| Branch | Issue | Area |
|---|---|---|
| `issue/18-guides-annotations` | #18 — worker annotations not showing | GUIDES |
| `issue/17-section-worked` | #17 — manager-confirmed section completion | TRAINING |
| `issue/9-phone-session` | #9 — stay logged in + configurable timer | UI |
| `issue/5-swiftpos` | #5 — staff sync verify, menu linking, kitchen dockets | SWIFTPOS |

## Open issue inventory

| # | Title | Type | Status |
|---|---|---|---|
| 20 | Approvals — worker series edit limits | bug | Closed (PR #25) |
| 19 | Tasks — dragged task stays in available list | bug | Closed (PR #26) |
| 18 | Guides — worker annotations missing | bug | Closed (PR #27) |
| 17 | Training/Sections — confirm worked-in-section | bug | Closed (PR #30) |
| 16 | Availability — no refresh/scroll loss (global) | bug | Closed (PR #25) |
| 14 | Availability — lock shifts | feature | Closed (PR #25) |
| 13 | Availability — bulk clear | feature | Closed (PR #25) |
| 12 | Availability — manual lock + auto-lock on approval | feature | Closed (PR #25) |
| 9 | App on Phone — session timeout | bug | Closed (PR #29) |
| 8 | Edit Mode — add task to list, expose settings | bug | Closed (PR #26) |
| 7 | Navigation — worker availability weekly default | feature | Closed (PR #25) |
| 5 | SwiftDOSNet — sync, menu linking, kitchen dockets | feature | **Open — blocked on live smoke test** (PR #28 merged) |
| 4 | Tasks & Lists — outcomes + chrome | bug + feature | Closed (PR #26) |
| 3 | Staff Rosters — admin-only drag/drop + confirmation | bug + feature | Verified, closed |
