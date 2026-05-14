# AGENTS.md — pi-worktree

- Git worktree commands: `/wt-create`, `/wt-merge`, `/wt-list`, `/wt-cleanup`.
- Worktrees live in `.worktrees/`; slug auto-generated (2–3 words via LLM, timeout 15s).
- Merge auto-commits untracked/modified files before merging (see `wt-merge.md`).
- `/wt-isolate` spawns subagent with isolation instructions for in-worktree work.
