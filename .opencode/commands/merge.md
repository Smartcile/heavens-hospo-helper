---
description: Merge a reviewed PR into develop (or promote develop to main).
agent: merger
---

Merge PR $ARGUMENTS using the release-manager rules.

- If `$ARGUMENTS` is empty, list the open PRs that are `MERGEABLE` / `CLEAN` and ask which one.
- Otherwise verify the PR, merge it, run the post-merge bookkeeping, and report the new `origin/develop` head.
- Do not merge to `main` unless I explicitly say "release".