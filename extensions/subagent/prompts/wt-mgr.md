---
description: Arbitrary worktree ops — spawn, list, delete (safe-only), multi-session
argument-hint: "<instructions>"
---

Invoke `subagent` in **single** mode with the `worktree` agent.

Task:
```
$@

Operations:
- Spawn: create worktrees + tmux windows/panes with pi
- Inspect: git worktree list, ls .worktrees/, tmux list-windows
- Delete: check for unmerged changes first — refuse if any exist, explain why
- Other: any worktree/tmux operation from instructions

If unclear — ask, do not guess.
```
