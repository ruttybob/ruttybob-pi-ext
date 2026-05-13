---
description: Merge worktree branch, close tmux, remove worktree — only on success
argument-hint: "<slug>"
---

Invoke `subagent` in **single** mode with the `worktree` agent.

Task:
```
Merge worktree $@ into main branch:

- Locate .worktrees/$@, determine branch (feature/<slug> or fix/<slug>)
- If worktree has untracked or modified files: git add -A && git commit -m "chore($@): auto-commit before merge"
- In main repo: git merge <branch>
- On success: close tmux window, remove worktree, delete branch
- On conflict: report, stop — do NOT close window or remove worktree

Close tmux ONLY after successful merge.
```
