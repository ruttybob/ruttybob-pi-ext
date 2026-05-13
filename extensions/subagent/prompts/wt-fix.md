---
description: Create isolated worktree + tmux window for a bugfix
argument-hint: "<fix-name>"
---

Invoke `subagent` in **single** mode with the `worktree` agent.

Task:
```
Create a worktree for fix: $@

- Slug: a-z0-9 and hyphens, max 20 chars
- Branch: fix/<slug>
- Worktree: .worktrees/<slug>
- Open tmux window with pi inside the worktree
- Check repo is clean before creating
```
